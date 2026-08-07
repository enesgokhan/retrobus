import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import { useLeaderboard } from '../lib/useLeaderboard'
import StageHeader from '../components/StageHeader'
import Empty from '../components/ui/Empty'
import Alert from '../components/ui/Alert'
import type { Member, Stage } from '../lib/types'
import Icon from '../components/ui/Icon'

interface Question {
  id: string
  kind: 'choice' | 'number'
  prompt: string
  options: string[]
  order_index: number
  time_limit_s: number
  base_points: number
  state: 'draft' | 'open' | 'revealed' | 'closed'
  opened_at: string | null
}
interface Answer {
  question_id: string
  member_id: string
  choice_index: number | null
  number_value: number | null
  elapsed_ms: number
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const TINTS = [
  'bg-coral text-[#1a0806] border-coral-deep',
  'bg-sky text-[#04101f] border-sky',
  'bg-amber text-[#1a1000] border-amber',
  'bg-grape text-[#160421] border-grape',
  'bg-teal text-[#04141a] border-teal',
  'bg-green text-[#04150a] border-green',
]

/** Bilgi yarışması — hız ağırlıklı puan, sorular arası canlı sıralama. */
export default function QuizStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [keys, setKeys] = useState<Record<string, { correct_index: number | null; correct_number: number | null }>>({})
  const [members, setMembers] = useState<Member[]>([])
  const [guess, setGuess] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Counted server-side: quiz_answers hides other people's rows until the
  // question is revealed, so counting what we can read always said 0.
  const [answeredCount, setAnsweredCount] = useState(0)
  const board = useLeaderboard(stage.meeting_id)

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      // Questions first, then answers/keys scoped to them. Unfiltered child
      // queries would span every quiz ever run and hit PostgREST's 1000-row cap.
      const [{ data: q }, { data: m }] = await Promise.all([
        supabase
          .from('quiz_questions')
          .select('id, kind, prompt, options, order_index, time_limit_s, base_points, state, opened_at')
          .eq('stage_id', stage.id)
          .order('order_index'),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
      ])
      if (cancelled) return
      const questionList = (q as Question[]) ?? []
      setQuestions(questionList)
      setMembers((m as Member[]) ?? [])

      const qIds = questionList.map((x) => x.id)
      if (!qIds.length) {
        setAnswers([])
        setKeys({})
        setAnsweredCount(0)
        return
      }
      const live = questionList.find((x) => x.state === 'open') ?? questionList.find((x) => x.state !== 'closed')
      if (live) {
        const { data: c } = await supabase.rpc('answered_count', { p_kind: 'quiz', p_id: live.id })
        if (!cancelled) setAnsweredCount((c as number) ?? 0)
      } else if (!cancelled) setAnsweredCount(0)
      const [{ data: a }, { data: k }] = await Promise.all([
        supabase.from('quiz_answers')
          .select('question_id, member_id, choice_index, number_value, elapsed_ms')
          .in('question_id', qIds),
        supabase.from('quiz_keys').select('question_id, correct_index, correct_number')
          .in('question_id', qIds),
      ])
      if (cancelled) return
      setAnswers((a as Answer[]) ?? [])
      const km: Record<string, { correct_index: number | null; correct_number: number | null }> = {}
      for (const row of (k as { question_id: string; correct_index: number | null; correct_number: number | null }[]) ?? []) {
        km[row.question_id] = { correct_index: row.correct_index, correct_number: row.correct_number }
      }
      setKeys(km)
    }
    load()
    const channel = liveChannel(`quiz-${stage.id}`, ['quiz_questions', 'quiz_answers', 'stages'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  // the live question, or the most recently revealed one
  const active = useMemo(() => {
    return (
      questions.find((q) => q.state === 'open') ??
      [...questions].reverse().find((q) => q.state === 'revealed') ??
      null
    )
  }, [questions])

  const myAnswer = active ? answers.find((a) => a.question_id === active.id && a.member_id === member?.id) : undefined
  const key = active ? keys[active.id] : undefined
  const revealed = active?.state === 'revealed' || active?.state === 'closed'
  const forQ = active ? answers.filter((a) => a.question_id === active.id) : []
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—'

  async function answerChoice(i: number) {
    if (!active || myAnswer) return
    setError(null)
    const { error: e } = await supabase.rpc('answer_quiz', { p_question_id: active.id, p_choice_index: i })
    if (e) setError('Cevap kaydedilemedi.')
  }

  async function answerNumber() {
    if (!active || myAnswer) return
    const n = Number(guess.replace(',', '.'))
    if (!Number.isFinite(n)) {
      setError('Bir sayı yaz.')
      return
    }
    setError(null)
    const { error: e } = await supabase.rpc('answer_quiz', { p_question_id: active.id, p_number: n })
    if (e) setError('Cevap kaydedilemedi.')
    else setGuess('')
  }

  async function open(id: string) {
    const { error: e } = await supabase.rpc('open_quiz', { p_question_id: id })
    if (e) setError('Soru açılamadı.')
  }
  async function reveal(id: string) {
    const { error: e } = await supabase.rpc('reveal_quiz', { p_question_id: id })
    if (e) setError('Cevap açılamadı.')
  }

  if (!questions.length) {
    return (
      <Empty
        icon={<Icon name="quiz" size={44} />}
        title={isHost ? 'Soru listesi boş' : 'Sorular hazırlanıyor'}
        body={
          isHost
            ? 'Konsoldaki durak ayarlarından hazır bir soru paketi ekle — tek tuş, beş soru.'
            : 'Sorular hazırlanıyor. Doğru cevap puan, hızlı cevap daha çok puan.'
        }
      />
    )
  }

  const header = (() => {
    if (!active) return { phase: 'Bilgi Yarışması', instruction: 'Bir soru açılmasını bekliyoruz.', waiting: true }
    if (revealed) return { phase: 'Cevap açıldı', instruction: 'Puanlar düştü — sıralamaya bak.', waiting: false }
    if (myAnswer) return { phase: 'Cevabın kayıtlı', instruction: 'Hız da sayılıyor. Diğerlerini bekliyoruz.', waiting: true }
    return {
      phase: `Soru ${active.order_index}/${questions.length}`,
      instruction: active.kind === 'number' ? 'Bir sayı tahmin et.' : 'Hızlı ol — erken doğru cevap daha çok puan.',
      waiting: false,
    }
  })()

  return (
    <div className="w-full max-w-4xl flex-1 flex flex-col gap-4">
      <StageHeader
        {...header}
        presenter={presenter}
        progress={active ? `${answeredCount}/${members.length} cevapladı` : null}
      />

      {error && (
        <Alert>{error}</Alert>
      )}

      {active ? (
        <section className="card flex flex-col gap-4">
          <h3 className={presenter ? 'text-display' : 'text-title-2'}>{active.prompt}</h3>

          {active.kind === 'choice' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {active.options.map((opt, i) => {
                const isCorrect = revealed && key?.correct_index === i
                const isMine = myAnswer?.choice_index === i
                const count = forQ.filter((a) => a.choice_index === i).length
                const canPick = active.state === 'open' && !myAnswer && !presenter
                return (
                  <button
                    key={i}
                    className={[
                      'rounded-2xl border-2 px-4 py-4 text-left font-bold transition flex items-center gap-3',
                      revealed
                        ? isCorrect
                          ? 'bg-teal text-[#04141a] border-teal'
                          : 'border-sep opacity-60'
                        : isMine
                          ? TINTS[i % TINTS.length]
                          : 'border-sep hover:border-label-2',
                      canPick ? 'cursor-pointer' : 'cursor-default',
                    ].join(' ')}
                    onClick={() => canPick && answerChoice(i)}
                    disabled={!canPick}
                  >
                    <span className="shrink-0 grid place-items-center size-8 rounded-full bg-black/10 text-subhead">
                      {LETTERS[i]}
                    </span>
                    <span className={presenter ? 'text-title-3' : ''}>{opt}</span>
                    {revealed && <span className="ml-auto text-subhead opacity-80">{count}</span>}
                    {isCorrect && <Icon name="check" size={18} />}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {revealed ? (
                <div className="text-center">
                  <div className="text-subhead font-bold uppercase tracking-widest text-label-2">Doğru cevap</div>
                  <div className="text-title-1 text-teal nums">{key?.correct_number ?? '—'}</div>
                </div>
              ) : myAnswer ? (
                <p className="text-center font-bold">
                  Tahminin: <span className="text-coral">{myAnswer.number_value}</span>
                </p>
              ) : (
                !presenter && (
                  <div className="flex items-center gap-2">
                    <input
                      className="field flex-1 text-center text-title-3 nums"
                      value={guess}
                      onChange={(e) => setGuess(e.target.value)}
                      placeholder="Sayı tahminin"
                      inputMode="decimal"
                      onKeyDown={(e) => e.key === 'Enter' && answerNumber()}
                    />
                    <button className="btn-filled" onClick={answerNumber} disabled={!guess.trim()}>
                      Gönder
                    </button>
                  </div>
                )
              )}
              {revealed && (
                <ul className="flex flex-col gap-1 text-subhead">
                  {[...forQ]
                    .sort(
                      (a, b) =>
                        Math.abs((a.number_value ?? 0) - (key?.correct_number ?? 0)) -
                        Math.abs((b.number_value ?? 0) - (key?.correct_number ?? 0)),
                    )
                    .map((a, i) => (
                      <li key={a.member_id} className="flex justify-between rounded-xl bg-bg px-3 py-1.5">
                        <span className="font-semibold">
                          {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}
                          {nameOf(a.member_id)}
                        </span>
                        <span className="tabular-nums">{a.number_value}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {myAnswer && !revealed && (
            <p className="text-subhead font-bold text-teal">Cevabın kaydedildi — hız da sayılıyor.</p>
          )}

          {isHost && !presenter && (
            <div className="flex gap-2 border-t-2 border-sep pt-3">
              {active.state === 'open' && (
                <button className="btn-filled" onClick={() => reveal(active.id)}>
                  Cevabı aç ve puanla
                </button>
              )}
            </div>
          )}
        </section>
      ) : (
        <Empty
          icon={<Icon name="quiz" size={44} />}
          title={isHost ? 'Henüz soru açmadın' : 'Soru bekleniyor'}
          body={
            isHost
              ? 'Aşağıdaki listeden bir soruyu aç — herkesin ekranında aynı anda belirir.'
              : 'İlk soru birazdan açılacak. Hız da puan getiriyor.'
          }
        />
      )}

      {/* sorular arası sıralama */}
      {revealed && board.length > 0 && (
        <section className="card flex flex-col gap-2">
          <h4 className="font-semibold text-subhead uppercase tracking-widest text-label-2">Sıralama</h4>
          {board.slice(0, presenter ? 10 : 5).map((r, i) => (
            <div key={r.member_id} className="flex items-center gap-3">
              <span className="w-6 text-right font-bold text-label-2">{i + 1}</span>
              <span aria-hidden>{r.avatar || '🙂'}</span>
              <span className="flex-1 font-bold truncate">{r.display_name}</span>
              <span className="font-semibold tabular-nums">{r.points}</span>
            </div>
          ))}
        </section>
      )}

      {isHost && !presenter && (
        <section className="card flex flex-col gap-1">
          {/* The same treatment Fibbage needed: a question list you can read.
              These were pills labelled "1. aç" / "2. açık" — the order index and
              a state, with the question itself only in a title attribute. */}
          <h4 className="text-footnote uppercase tracking-widest text-label-3 font-medium">
            Sorular ({questions.length})
          </h4>
          {questions.map((q) => (
            <div
              key={q.id}
              className={[
                'flex items-center gap-3 rounded-sm px-3 py-2 transition-colors duration-150',
                q.state === 'open'
                  ? 'bg-(--color-bg-2) shadow-[inset_0_0_0_1px_var(--tint)]'
                  : 'hover:bg-(--color-bg-2)',
              ].join(' ')}
            >
              <span className="flex-1 min-w-0">
                <span
                  className={['text-subhead truncate block', q.state === 'closed' ? 'text-label-3' : ''].join(' ')}
                >
                  {q.prompt}
                </span>
                <span className="text-[11px] text-label-3">
                  {q.state === 'open' ? 'şu an açık' : q.state === 'draft' ? 'hazır' : 'açıldı'}
                </span>
              </span>
              {q.state === 'draft' && (
                <button className="btn-gray text-footnote shrink-0 px-2 py-1" onClick={() => void open(q.id)}>
                  Aç
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
