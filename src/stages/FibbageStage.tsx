import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import StageHeader from '../components/StageHeader'
import Empty from '../components/ui/Empty'
import Alert from '../components/ui/Alert'
import type { Member, Stage } from '../lib/types'
import Icon from '../components/ui/Icon'

interface Round {
  id: string
  prompt: string
  phase: 'lie' | 'guess' | 'revealed'
  order_index: number
  multiplier: number
}
/** One option as the server chooses to describe it, given the phase. */
interface FibOption {
  opt_id: string
  body: string
  /** null until the reveal — the client is never told early */
  is_truth: boolean | null
  /** your own lie, so the UI can stop you picking it */
  is_mine: boolean
  /** who wrote it; null until the reveal */
  author: string | null
}
/** Everything else the screen may know, again decided by phase on the server. */
interface FibState {
  phase: 'lie' | 'guess' | 'revealed' | null
  /** the token you picked — never whether it was right */
  my_pick: string | null
  picked_count: number
  /** token → names, only once revealed */
  takers: Record<string, string[]>
}

/**
 * Fibbage — gerçek cevabı bulmaya çalış, bu arada kendi yalanınla başkalarını kandır.
 *
 * İstemci fibbage_lies veya fibbage_picks tablolarını HİÇ okumaz. Yalanları
 * okuyabilmek, seçenek listesinden çıkarma yaparak gerçeği adlandırmayı; kendi
 * seçimini okuyabilmek ise doğru bilip bilmediğini öğrenmeyi mümkün kılıyordu.
 * Ekranın bildiği her şey aşamaya göre cevap veren fonksiyonlardan gelir.
 */
export default function FibbageStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const [rounds, setRounds] = useState<Round[]>([])
  // fibbage_lies and fibbage_picks are no longer readable by clients at all:
  // reading the lies let you name the truth by subtracting them from the option
  // list, and reading your own pick told you whether you had found it. Both now
  // arrive through phase-gated functions.
  const [state, setState] = useState<FibState>({ phase: null, my_pick: null, picked_count: 0, takers: {} })
  const [lieCount, setLieCount] = useState(0)
  const [myLieBody, setMyLieBody] = useState<string | null>(null)
  // Options come from fib_options: the lies AND the truth, in one list, with
  // opaque ids. Nothing in the payload says which is which until the reveal.
  //
  // The obvious alternative — letting the client read fibbage_keys during the
  // guess phase — puts the answer in a JSON field literally called "truth", so
  // anyone with devtools open wins every round. And gating that key on the host
  // alone (what 0016 did) meant the truth was on NOBODY's list but the host's,
  // which made the game unwinnable for the room.
  const [options, setOptions] = useState<FibOption[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [newRound, setNewRound] = useState({ prompt: '', truth: '', multiplier: 1 })
  const [confirmRound, setConfirmRound] = useState<string | null>(null)
  const [roundArmed, setRoundArmed] = useState(0)

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
        supabase.from('fibbage_rounds').select('id, prompt, phase, order_index, multiplier')
          .eq('stage_id', stage.id).order('order_index'),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
      ])
      if (cancelled) return
      const roundList = (r as Round[]) ?? []
      setRounds(roundList)
      setMembers((m as Member[]) ?? [])

      if (!roundList.length) {
        setOptions([])
        setLieCount(0)
        setMyLieBody(null)
        return
      }
      const cur = roundList.find((x) => x.id === ((stage.config.current_round_id as string) ?? '')) ??
        roundList.find((x) => x.phase !== 'revealed') ?? null
      if (!cur) {
        if (!cancelled) { setOptions([]); setLieCount(0); setMyLieBody(null) }
        return
      }
      const [{ data: o }, { data: st }, { data: mine }] = await Promise.all([
        cur.phase !== 'lie'
          ? supabase.rpc('fib_options', { p_round_id: cur.id })
          : Promise.resolve({ data: [] }),
        supabase.rpc('fib_state', { p_round_id: cur.id }),
        supabase.rpc('fib_my_lie', { p_round_id: cur.id }),
      ])
      if (cancelled) return
      setOptions((o as FibOption[]) ?? [])
      const blob = (st as FibState) ?? { phase: null, my_pick: null, picked_count: 0, takers: {} }
      setState(blob)
      const my = (mine as { body: string; written: number } | null) ?? null
      setMyLieBody(my?.body ?? null)
      setLieCount(my?.written ?? 0)
    }
    load()
    const channel = liveChannel(
      `fib-${stage.id}`,
      ['fibbage_rounds', 'fibbage_lies', 'fibbage_keys', 'fibbage_picks', 'stages'],
      load,
    )
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  const myPick = state.my_pick

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

  // We send back the opaque option id and let the database decide whether it was
  // the truth — the client is not told, so it cannot be asked.
  async function pick(optId: string) {
    if (!round) return
    setError(null)
    const { error: e } = await supabase.rpc('pick_fib_option', {
      p_round_id: round.id,
      p_opt_id: optId,
    })
    if (e) setError(e.message.includes('own') ? 'Kendi yalanını seçemezsin.' : 'Seçilemedi.')
  }

  /** Stable pseudo-random order from an id, so the truth never sits in a tell-tale place. */
  function seedOf(id: string): number {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000
    return h / 100000
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
  /**
   * Put a question on the room's screens.
   *
   * This used to be written inline as `onClick={() => supabase.from(...)...}`.
   * A PostgREST builder is lazy — it only performs the request when it is
   * awaited — and React discards a handler's return value, so nothing ever
   * called it. The request was never sent. That is why the old numbered pills
   * appeared to do nothing, and why "adding a second question deletes the first"
   * was an accurate description: there was genuinely no way back to it.
   */
  async function showRound(id: string) {
    const { error: e } = await supabase
      .from('stages')
      .update({ config: { ...stage.config, current_round_id: id } })
      .eq('id', stage.id)
    if (e) setError('Soruya geçilemedi.')
  }

  /** Remove a question. If it was the one on screen, move to another rather
   *  than leaving the room looking at a stop that no longer has anything. */
  async function removeRound(id: string) {
    const { error: e } = await supabase.from('fibbage_rounds').delete().eq('id', id)
    if (e) { setError('Soru silinemedi.'); return }
    if ((stage.config.current_round_id as string | undefined) === id) {
      const next = rounds.find((r) => r.id !== id)
      await supabase.from('stages')
        .update({ config: { ...stage.config, current_round_id: next?.id ?? null } })
        .eq('id', stage.id)
    }
  }

  async function addRound() {
    if (!newRound.prompt.trim() || !newRound.truth.trim()) return
    // one RPC, because prompt and truth now live in two tables and a round with
    // no truth would be unplayable
    const { data, error: e } = await supabase.rpc('create_fibbage_round', {
      p_stage_id: stage.id,
      p_prompt: newRound.prompt.trim(),
      p_truth: newRound.truth.trim(),
      p_multiplier: newRound.multiplier,
    })
    if (e) { setError('Tur eklenemedi.'); return }
    setNewRound({ prompt: '', truth: '', multiplier: 1 })
    if (data) {
      await supabase.from('stages')
        .update({ config: { ...stage.config, current_round_id: data as string } })
        .eq('id', stage.id)
    }
  }

  const hostPanel = isHost && !presenter && (
    <section className="card flex flex-col gap-3">
      <h4 className="font-bold text-subhead">Yönetim</h4>
      {round && (
        <div className="flex flex-wrap gap-2">
          {round.phase === 'lie' && (
            <button className="btn-filled text-subhead" onClick={() => setPhase('guess')}>
              Tahmine geç ({lieCount} yalan)
            </button>
          )}
          {round.phase === 'guess' && (
            <button className="btn-filled text-subhead" onClick={reveal}>
              Gerçeği aç ve puanla ({state.picked_count} seçim)
            </button>
          )}
        </div>
      )}
      <details className="rounded-2xl border-2 border-sep p-3">
        <summary className="font-bold text-subhead cursor-pointer">Yeni tur ekle</summary>
        <div className="flex flex-col gap-2 mt-3">
          <input
            className="field"
            value={newRound.prompt}
            onChange={(e) => setNewRound((n) => ({ ...n, prompt: e.target.value }))}
            placeholder="Soru… (örn. Enes’in ilk işi neydi?)"
            maxLength={400}
          />
          <input
            className="field"
            value={newRound.truth}
            onChange={(e) => setNewRound((n) => ({ ...n, truth: e.target.value }))}
            placeholder="Gerçek cevap"
            maxLength={200}
          />
          <label className="flex flex-col gap-1">
            <span className="text-footnote font-semibold text-label-2">Puan çarpanı (Jackbox: son turlar daha değerli)</span>
            <select
              className="field"
              value={newRound.multiplier}
              onChange={(e) => setNewRound((n) => ({ ...n, multiplier: Number(e.target.value) }))}
            >
              <option value={1}>×1 — normal tur</option>
              <option value={2}>×2 — ikinci tur</option>
              <option value={3}>×3 — final turu</option>
            </select>
          </label>
          <button className="btn-filled self-start text-subhead" onClick={addRound}>
            Ekle ve başlat
          </button>
        </div>
      </details>
      {/* The question list.
          This used to be a row of pills labelled with nothing but an order
          index — "1", "2" — shown only once a second round existed. So adding a
          second question made the first vanish from the screen, and the only way
          back was guessing that a numbered dot was a button. Reported, fairly,
          as "it deletes the first question when you add another": the data was
          always there, but nothing on screen said so.
          The list now shows every question in full, says which one the room is
          looking at, and lets the host remove one. */}
      {rounds.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <h5 className="text-footnote uppercase tracking-widest text-label-3 font-medium">
            Sorular ({rounds.length})
          </h5>
          {rounds.map((r) => {
            const current = r.id === round?.id
            return (
              <div
                key={r.id}
                className={[
                  'flex items-center gap-3 rounded-sm px-3 py-2 transition-colors duration-150',
                  current ? 'bg-[--color-bg-2] shadow-[inset_0_0_0_1px_var(--tint)]' : 'hover:bg-[--color-bg-2]',
                ].join(' ')}
              >
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => void showRound(r.id)}
                  title={current ? 'Şu an bu gösteriliyor' : 'Bu soruya geç'}
                >
                  <span className={['text-subhead truncate block', r.phase === 'revealed' ? 'text-label-3' : ''].join(' ')}>
                    {r.prompt}
                  </span>
                  <span className="text-[11px] text-label-3">
                    {current && 'şu an · '}
                    {r.phase === 'lie' ? 'yalan yazılıyor'
                      : r.phase === 'guess' ? 'tahmin ediliyor'
                      : 'açıldı'}
                    {r.multiplier > 1 && ` · ×${r.multiplier}`}
                  </span>
                </button>
                <button
                  className="btn-danger text-footnote shrink-0 px-2 py-1"
                  onClick={() => {
                    if (confirmRound !== r.id) { setConfirmRound(r.id); setRoundArmed(Date.now()); return }
                    if (Date.now() - roundArmed < 700) return
                    setConfirmRound(null)
                    void removeRound(r.id)
                  }}
                  onBlur={() => setConfirmRound((c) => (c === r.id ? null : c))}
                >
                  {confirmRound === r.id ? 'Emin misin?' : 'Sil'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )

  if (!round) {
    return (
      <div className="w-full max-w-3xl flex-1 flex flex-col gap-6">
        <Empty
          icon={<Icon name="fibbage" size={44} />}
          title={isHost ? 'Henüz bir tur yok' : 'Tur hazırlanıyor'}
          body={
            isHost
              ? 'Bir soru ve gerçek cevabını yaz. Herkes buna inandırıcı bir yalan uyduracak.'
              : 'Soru hazırlanıyor. Sonra herkes birer yalan uyduracak — gerçeği bulan puan alır.'
          }
        />
        {hostPanel}
      </div>
    )
  }

  const header = (() => {
    if (round.phase === 'lie') {
      return myLieBody
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
    <div className="w-full max-w-4xl flex-1 flex flex-col gap-4">
      <StageHeader
        {...header}
        presenter={presenter}
        progress={
          round.phase === 'lie' ? `${lieCount}/${members.length} yalan`
          : round.phase === 'guess' ? `${state.picked_count}/${members.length} seçim`
          : null
        }
      />

      {error && (
        <Alert>{error}</Alert>
      )}

      <section className="card flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className={presenter ? 'text-display' : 'text-title-1'}>
            {round.prompt}
          </h3>
          {round.multiplier > 1 && (
            <span className="shrink-0 rounded-full bg-grape text-[#160421] px-3 py-1 text-subhead font-semibold">
              ×{round.multiplier}
            </span>
          )}
        </div>

        {round.phase === 'lie' && (
          <>
            {myLieBody ? (
              <p className="font-bold text-teal">
                Yalanın hazır: “{myLieBody}” — {lieCount}/{members.length} kişi yazdı
              </p>
            ) : (
              !presenter && (
                <div className="flex items-center gap-2">
                  <input
                    className="field flex-1"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="İnandırıcı bir yalan yaz…"
                    maxLength={200}
                    onKeyDown={(e) => e.key === 'Enter' && submitLie()}
                  />
                  <button className="btn-filled" onClick={submitLie} disabled={!draft.trim()}>
                    Gönder
                  </button>
                </div>
              )
            )}

          </>
        )}

        {round.phase !== 'lie' && (
          <div className="flex flex-col gap-2">
            {/* the truth is in here, indistinguishable until the reveal */}
            {options
              .map((o) => ({ ...o, seed: seedOf(o.opt_id) }))
              .sort((a, b) => a.seed - b.seed)
              .map((opt) => {
                const revealed = round.phase === 'revealed'
                const isTruth = opt.is_truth === true
                const isMine = opt.is_mine
                const takers = state.takers[opt.opt_id] ?? []
                // compare tokens, so "which one did I choose" never implies
                // "and was it the right one"
                const picked = myPick === opt.opt_id
                const canPick = round.phase === 'guess' && !myPick && !isMine && !presenter

                return (
                  <button
                    key={opt.opt_id}
                    className={[
                      'rounded-2xl border-2 px-4 py-3 text-left font-bold transition',
                      revealed
                        ? isTruth
                          ? 'bg-teal text-[#04141a] border-teal'
                          : 'border-sep opacity-70'
                        : picked
                          ? 'bg-rose-soft border-coral'
                          : 'border-sep',
                      canPick ? 'hover:border-coral cursor-pointer' : 'cursor-default',
                      isMine && !revealed ? 'opacity-60' : '',
                    ].join(' ')}
                    onClick={() => canPick && pick(opt.opt_id)}
                    disabled={!canPick}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className={presenter ? 'text-title-3' : ''}>
                        {revealed && (isTruth ? '✅ ' : '🤥 ')}
                        {opt.body}
                      </span>
                      {isMine && !revealed && (
                        <span className="text-footnote shrink-0 opacity-70">senin yalanın</span>
                      )}
                    </div>
                    {revealed && (
                      <p className="text-footnote font-semibold mt-1.5 opacity-80">
                        {!isTruth && opt.author && `${opt.author} yazdı. `}
                        {takers.length > 0
                          ? `Seçenler: ${takers.join(', ')}`
                          : 'Kimse seçmedi.'}
                      </p>
                    )}
                  </button>
                )
              })}
            {myPick && round.phase === 'guess' && (
              <p className="text-subhead font-bold text-teal">Seçimin kaydedildi.</p>
            )}
          </div>
        )}
      </section>

      {hostPanel}
    </div>
  )
}
