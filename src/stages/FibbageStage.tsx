import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import StageHeader from '../components/StageHeader'
import type { Member, Stage } from '../lib/types'

interface Round {
  id: string
  prompt: string
  truth: string | null
  phase: 'lie' | 'guess' | 'revealed'
  order_index: number
  multiplier: number
}
interface Lie {
  id: string
  round_id: string
  body: string
  sort_seed: number
}
interface Pick {
  round_id: string
  picker_member_id: string
  lie_id: string | null
  picked_truth: boolean
}

/**
 * Fibbage — gerçek cevabı bulmaya çalış, bu arada kendi yalanınla başkalarını kandır.
 *
 * Yazarlık bilgisi `fib_authorship` RPC'siyle gelir: tahmin aşamasında sadece
 * kendi yalanını görürsün, herkesinki ancak açılışta görünür. Sütun düzeyinde
 * yetki hiç verilmedi, çünkü satır politikası tek bir kolonu koruyamaz.
 */
export default function FibbageStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const [rounds, setRounds] = useState<Round[]>([])
  const [lies, setLies] = useState<Lie[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [authors, setAuthors] = useState<Record<string, string>>({})
  const [members, setMembers] = useState<Member[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [newRound, setNewRound] = useState({ prompt: '', truth: '', multiplier: 1 })

  const currentId = (stage.config.current_round_id as string | undefined) ?? null
  const round = rounds.find((r) => r.id === currentId) ?? rounds.find((r) => r.phase !== 'revealed') ?? null

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      // Rounds first, then children filtered to THIS stage's rounds. Fetching
      // lies/picks unfiltered would pull every round ever played, and PostgREST
      // caps responses at 1000 rows — so a reused app eventually starves the
      // current game of its own data.
      const [{ data: r }, { data: m }] = await Promise.all([
        supabase.from('fibbage_rounds').select('id, prompt, truth, phase, order_index, multiplier')
          .eq('stage_id', stage.id).order('order_index'),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
      ])
      if (cancelled) return
      const roundList = (r as Round[]) ?? []
      setRounds(roundList)
      setMembers((m as Member[]) ?? [])

      const roundIds = roundList.map((x) => x.id)
      if (!roundIds.length) {
        setLies([])
        setPicks([])
        return
      }
      const [{ data: l }, { data: p }] = await Promise.all([
        supabase.from('fibbage_lies').select('id, round_id, body, sort_seed')
          .in('round_id', roundIds).order('sort_seed'),
        supabase.from('fibbage_picks').select('round_id, picker_member_id, lie_id, picked_truth')
          .in('round_id', roundIds),
      ])
      if (cancelled) return
      setLies((l as Lie[]) ?? [])
      setPicks((p as Pick[]) ?? [])
    }
    load()
    const channel = liveChannel(
      `fib-${stage.id}`,
      ['fibbage_rounds', 'fibbage_lies', 'fibbage_picks', 'stages'],
      load,
    )
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  // authorship comes from the gated RPC, never from a column
  useEffect(() => {
    if (!round) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.rpc('fib_authorship', { p_round_id: round.id })
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const row of (data as { lie_id: string; author_member_id: string }[]) ?? []) {
        map[row.lie_id] = row.author_member_id
      }
      setAuthors(map)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only id/phase/pick-count
    // matter; the whole `round` object changes identity on every refetch.
  }, [round?.id, round?.phase, picks.length])

  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—'
  const roundLies = round ? lies.filter((l) => l.round_id === round.id) : []
  const roundPicks = round ? picks.filter((p) => p.round_id === round.id) : []
  const myLie = roundLies.find((l) => authors[l.id] === member?.id)
  const myPick = roundPicks.find((p) => p.picker_member_id === member?.id)

  async function submitLie() {
    if (!round || !draft.trim()) return
    setError(null)
    const { error: e } = await supabase.rpc('submit_fib_lie', { p_round_id: round.id, p_body: draft })
    if (e) {
      setError(
        e.message.includes('the truth') ? 'O gerçek cevap! Başka bir şey yaz.'
        : e.message.includes('already wrote') ? 'Birisi aynı yalanı yazmış — başka bir şey düşün.'
        : 'Kaydedilemedi.',
      )
    } else {
      setDraft('')
    }
  }

  async function pick(lieId: string | null, truth: boolean) {
    if (!round) return
    setError(null)
    const { error: e } = await supabase.rpc('pick_fib', {
      p_round_id: round.id,
      p_lie_id: lieId,
      p_truth: truth,
    })
    if (e) setError(e.message.includes('own') ? 'Kendi yalanını seçemezsin.' : 'Seçilemedi.')
  }

  async function setPhase(phase: Round['phase']) {
    if (!round) return
    await supabase.from('fibbage_rounds').update({ phase }).eq('id', round.id)
  }
  async function reveal() {
    if (!round) return
    const { error: e } = await supabase.rpc('reveal_fib', { p_round_id: round.id })
    if (e) setError('Açılamadı.')
  }
  async function addRound() {
    if (!newRound.prompt.trim() || !newRound.truth.trim()) return
    const order = rounds.length ? Math.max(...rounds.map((r) => r.order_index)) + 1 : 1
    const { data } = await supabase.from('fibbage_rounds').insert({
      stage_id: stage.id,
      prompt: newRound.prompt.trim(),
      truth: newRound.truth.trim(),
      order_index: order,
      multiplier: newRound.multiplier,
    }).select().single()
    setNewRound({ prompt: '', truth: '', multiplier: 1 })
    if (data) {
      await supabase.from('stages')
        .update({ config: { ...stage.config, current_round_id: data.id } })
        .eq('id', stage.id)
    }
  }

  const hostPanel = isHost && !presenter && (
    <section className="card flex flex-col gap-3">
      <h4 className="font-bold text-sm">Şoför</h4>
      {round && (
        <div className="flex flex-wrap gap-2">
          {round.phase === 'lie' && (
            <button className="btn-coral text-sm" onClick={() => setPhase('guess')}>
              Tahmine geç ({roundLies.length} yalan)
            </button>
          )}
          {round.phase === 'guess' && (
            <button className="btn-coral text-sm" onClick={reveal}>
              Gerçeği aç ve puanla ({roundPicks.length} seçim)
            </button>
          )}
        </div>
      )}
      <details className="rounded-2xl border-2 border-line p-3">
        <summary className="font-bold text-sm cursor-pointer">Yeni tur ekle</summary>
        <div className="flex flex-col gap-2 mt-3">
          <input
            className="input-blob"
            value={newRound.prompt}
            onChange={(e) => setNewRound((n) => ({ ...n, prompt: e.target.value }))}
            placeholder="Soru… (örn. Enes’in ilk işi neydi?)"
            maxLength={400}
          />
          <input
            className="input-blob"
            value={newRound.truth}
            onChange={(e) => setNewRound((n) => ({ ...n, truth: e.target.value }))}
            placeholder="Gerçek cevap"
            maxLength={200}
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink-soft">Puan çarpanı (Jackbox: son turlar daha değerli)</span>
            <select
              className="input-blob"
              value={newRound.multiplier}
              onChange={(e) => setNewRound((n) => ({ ...n, multiplier: Number(e.target.value) }))}
            >
              <option value={1}>×1 — normal tur</option>
              <option value={2}>×2 — ikinci tur</option>
              <option value={3}>×3 — final turu</option>
            </select>
          </label>
          <button className="btn-coral self-start text-sm" onClick={addRound}>
            Ekle ve başlat
          </button>
        </div>
      </details>
      {rounds.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {rounds.map((r) => (
            <button
              key={r.id}
              className={[
                'rounded-full px-2.5 py-1 text-xs font-bold border-2',
                r.id === round?.id ? 'bg-coral text-white border-coral-deep' : 'border-line',
                r.phase === 'revealed' ? 'opacity-50' : '',
              ].join(' ')}
              onClick={() =>
                supabase.from('stages')
                  .update({ config: { ...stage.config, current_round_id: r.id } })
                  .eq('id', stage.id)
              }
            >
              {r.order_index}
            </button>
          ))}
        </div>
      )}
    </section>
  )

  if (!round) {
    return (
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <p className="text-center text-ink-soft">
          {isHost ? 'Tur yok — aşağıdan ekle.' : 'Şoför turu hazırlıyor…'}
        </p>
        {hostPanel}
      </div>
    )
  }

  const header = (() => {
    if (round.phase === 'lie') {
      return myLie
        ? { phase: 'Yalanın hazır', instruction: 'Diğerlerini bekliyoruz.', waiting: true }
        : { phase: 'Yalan yazma zamanı', instruction: 'Gerçek sanılacak bir yalan yaz. Kandırdığın her kişi puan.', waiting: false }
    }
    if (round.phase === 'guess') {
      return myPick
        ? { phase: 'Seçimin kayıtlı', instruction: 'Diğerlerini bekliyoruz.', waiting: true }
        : { phase: 'Gerçeği bul', instruction: 'Hangisi gerçek cevap? Kendi yalanını seçemezsin.', waiting: false }
    }
    return { phase: 'Sonuç', instruction: 'Gerçek açıldı — kim kimi kandırdı?', waiting: false }
  })()

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      <StageHeader
        {...header}
        presenter={presenter}
        progress={
          round.phase === 'lie' ? `${roundLies.length}/${members.length} yalan`
          : round.phase === 'guess' ? `${roundPicks.length}/${members.length} seçim`
          : null
        }
      />

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
      )}

      <section className="card flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className={presenter ? 'text-4xl font-extrabold' : 'text-2xl font-extrabold'}>{round.prompt}</h3>
          {round.multiplier > 1 && (
            <span className="shrink-0 rounded-full bg-grape text-white px-3 py-1 text-sm font-extrabold">
              ×{round.multiplier}
            </span>
          )}
        </div>

        {round.phase === 'lie' && (
          <>
            {myLie ? (
              <p className="font-bold text-teal">
                ✅ Yalanın hazır: “{myLie.body}” — {roundLies.length}/{members.length} kişi yazdı
              </p>
            ) : (
              !presenter && (
                <div className="flex items-center gap-2">
                  <input
                    className="input-blob flex-1"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="İnandırıcı bir yalan yaz…"
                    maxLength={200}
                    onKeyDown={(e) => e.key === 'Enter' && submitLie()}
                  />
                  <button className="btn-coral" onClick={submitLie} disabled={!draft.trim()}>
                    Gönder
                  </button>
                </div>
              )
            )}
            <p className="text-xs font-semibold text-ink-soft">
              Amaç: gerçek cevap sanılacak bir yalan. Kandırdığın her kişi +500.
            </p>
          </>
        )}

        {round.phase !== 'lie' && (
          <div className="flex flex-col gap-2">
            {/* truth is mixed in among the lies */}
            {[
              ...roundLies.map((l) => ({ kind: 'lie' as const, id: l.id, body: l.body, seed: l.sort_seed })),
              ...(round.truth
                ? [{ kind: 'truth' as const, id: 'truth', body: round.truth, seed: 0.5 }]
                : []),
            ]
              .sort((a, b) => a.seed - b.seed)
              .map((opt) => {
                const isTruth = opt.kind === 'truth'
                const revealed = round.phase === 'revealed'
                const author = opt.kind === 'lie' ? authors[opt.id] : null
                const isMine = author === member?.id
                const takers = roundPicks.filter((p) =>
                  isTruth ? p.picked_truth : p.lie_id === opt.id,
                )
                const picked = isTruth ? myPick?.picked_truth : myPick?.lie_id === opt.id
                const canPick = round.phase === 'guess' && !myPick && !isMine && !presenter

                return (
                  <button
                    key={opt.id}
                    className={[
                      'rounded-2xl border-2 px-4 py-3 text-left font-bold transition',
                      revealed
                        ? isTruth
                          ? 'bg-teal text-white border-teal'
                          : 'border-line opacity-70'
                        : picked
                          ? 'bg-rose-soft border-coral'
                          : 'border-line',
                      canPick ? 'hover:border-coral cursor-pointer' : 'cursor-default',
                      isMine && !revealed ? 'opacity-60' : '',
                    ].join(' ')}
                    onClick={() => canPick && pick(isTruth ? null : opt.id, isTruth)}
                    disabled={!canPick}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className={presenter ? 'text-xl' : ''}>
                        {revealed && (isTruth ? '✅ ' : '🤥 ')}
                        {opt.body}
                      </span>
                      {isMine && !revealed && (
                        <span className="text-xs shrink-0 opacity-70">senin yalanın</span>
                      )}
                    </div>
                    {revealed && (
                      <p className="text-xs font-semibold mt-1.5 opacity-80">
                        {!isTruth && author && `${nameOf(author)} yazdı. `}
                        {takers.length > 0
                          ? `Seçenler: ${takers.map((t) => nameOf(t.picker_member_id)).join(', ')}`
                          : 'Kimse seçmedi.'}
                      </p>
                    )}
                  </button>
                )
              })}
            {myPick && round.phase === 'guess' && (
              <p className="text-sm font-bold text-teal text-center">✅ Seçimin kaydedildi.</p>
            )}
          </div>
        )}
      </section>

      {hostPanel}
    </div>
  )
}
