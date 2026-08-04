import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import { useLeaderboard } from '../lib/useLeaderboard'
import StageHeader from '../components/StageHeader'
import StageEmpty from '../components/StageEmpty'
import type { Member, Stage } from '../lib/types'

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
  'bg-coral text-white border-coral-deep',
  'bg-sky text-white border-sky',
  'bg-amber text-ink border-amber',
  'bg-grape text-white border-grape',
  'bg-teal text-white border-teal',
  'bg-ink text-white border-ink',
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
      <StageEmpty
        icon="🏆"
        title={isHost ? 'Soru listesi boş' : 'Sorular hazırlanıyor'}
        body={
          isHost
            ? 'Konsoldaki durak ayarlarından hazır bir soru paketi ekle — tek tuş, beş soru.'
            : 'Şoför soruları hazırlıyor. Doğru cevap puan, hızlı doğru cevap daha çok puan.'
        }
      />
    )
  }

  const header = (() => {
    if (!active) return { phase: 'Bilgi Yarışması', instruction: 'Şoförün soru açmasını bekliyoruz.', waiting: true }
    if (revealed) return { phase: 'Cevap açıldı', instruction: 'Puanlar düştü — sıralamaya bak.', waiting: false }
    if (myAnswer) return { phase: 'Cevabın kayıtlı', instruction: 'Hız da sayılıyor. Diğerlerini bekliyoruz.', waiting: true }
    return {
      phase: `Soru ${active.order_index}/${questions.length}`,
      instruction: active.kind === 'number' ? 'Bir sayı tahmin et.' : 'Hızlı ol — erken doğru cevap daha çok puan.',
      waiting: false,
    }
  })()

  return (
    <div className="w-full max-w-4xl flex flex-col gap-4">
      <StageHeader
        {...header}
        presenter={presenter}
        progress={active ? `${answeredCount}/${members.length} cevapladı` : null}
      />

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
      )}

      {active ? (
        <section className="card flex flex-col gap-4">
          <h3 className={presenter ? 'text-4xl font-extrabold' : 'text-2xl font-extrabold'}>{active.prompt}</h3>

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
                          ? 'bg-teal text-white border-teal'
                          : 'border-line opacity-60'
                        : isMine
                          ? TINTS[i % TINTS.length]
                          : 'border-line hover:border-ink-soft',
                      canPick ? 'cursor-pointer' : 'cursor-default',
                    ].join(' ')}
                    onClick={() => canPick && answerChoice(i)}
                    disabled={!canPick}
                  >
                    <span className="shrink-0 grid place-items-center size-8 rounded-full bg-black/10 text-sm">
                      {LETTERS[i]}
                    </span>
                    <span className={presenter ? 'text-xl' : ''}>{opt}</span>
                    {revealed && <span className="ml-auto text-sm opacity-80">{count}</span>}
                    {isCorrect && <span aria-hidden>✅</span>}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {revealed ? (
                <div className="text-center">
                  <div className="text-sm font-bold uppercase tracking-widest text-ink-soft">Doğru cevap</div>
                  <div className="text-5xl font-extrabold text-teal">{key?.correct_number ?? '—'}</div>
                </div>
              ) : myAnswer ? (
                <p className="text-center font-bold">
                  Tahminin: <span className="text-coral">{myAnswer.number_value}</span>
                </p>
              ) : (
                !presenter && (
                  <div className="flex items-center gap-2">
                    <input
                      className="input-blob flex-1 text-center text-xl"
                      value={guess}
                      onChange={(e) => setGuess(e.target.value)}
                      placeholder="Sayı tahminin"
                      inputMode="decimal"
                      onKeyDown={(e) => e.key === 'Enter' && answerNumber()}
                    />
                    <button className="btn-coral" onClick={answerNumber} disabled={!guess.trim()}>
                      Gönder
                    </button>
                  </div>
                )
              )}
              {revealed && (
                <ul className="flex flex-col gap-1 text-sm">
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
            <p className="text-sm font-bold text-teal text-center">✅ Cevabın kaydedildi — hız da sayılıyor.</p>
          )}

          {isHost && !presenter && (
            <div className="flex gap-2 border-t-2 border-line pt-3">
              {active.state === 'open' && (
                <button className="btn-coral" onClick={() => reveal(active.id)}>
                  Cevabı aç ve puanla
                </button>
              )}
            </div>
          )}
        </section>
      ) : (
        <StageEmpty
          icon="🏆"
          title={isHost ? 'Henüz soru açmadın' : 'Soru bekleniyor'}
          body={
            isHost
              ? 'Aşağıdaki listeden bir soruyu aç — herkesin ekranında aynı anda belirir.'
              : 'Şoför birazdan ilk soruyu açacak. Hız da puan getiriyor, hazır ol.'
          }
        />
      )}

      {/* sorular arası sıralama */}
      {revealed && board.length > 0 && (
        <section className="card flex flex-col gap-2">
          <h4 className="font-extrabold text-sm uppercase tracking-widest text-ink-soft">Sıralama</h4>
          {board.slice(0, presenter ? 10 : 5).map((r, i) => (
            <div key={r.member_id} className="flex items-center gap-3">
              <span className="w-6 text-right font-bold text-ink-soft">{i + 1}</span>
              <span aria-hidden>{r.avatar || '🙂'}</span>
              <span className="flex-1 font-bold truncate">{r.display_name}</span>
              <span className="font-extrabold tabular-nums">{r.points}</span>
            </div>
          ))}
        </section>
      )}

      {isHost && !presenter && (
        <section className="card flex flex-col gap-2">
          <h4 className="font-bold text-sm">Şoför: sorular</h4>
          <div className="flex flex-wrap gap-2">
            {questions.map((q) => (
              <button
                key={q.id}
                className={[
                  'rounded-full px-3 py-1.5 text-xs font-bold border-2',
                  q.state === 'open'
                    ? '[background:var(--stage-accent)] text-[var(--stage-accent-ink)] [border-color:var(--stage-accent-deep)]'
                    : q.state === 'draft'
                      ? 'border-line'
                      : 'border-teal text-teal',
                ].join(' ')}
                onClick={() => q.state === 'draft' && open(q.id)}
                disabled={q.state !== 'draft'}
                title={q.prompt}
              >
                {q.order_index}. {q.state === 'draft' ? 'aç' : q.state === 'open' ? 'açık' : '✓'}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
