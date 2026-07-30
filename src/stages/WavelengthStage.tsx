import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import { SPECTRUM_PAIRS } from '../content/tr/spectrums'
import { playConfirm, playReveal } from '../lib/celebrate'
import type { Member, Stage } from '../lib/types'

interface Round {
  id: string
  left_label: string
  right_label: string
  psychic_member_id: string
  clue: string | null
  phase: 'clue' | 'guess' | 'revealed'
  order_index: number
}
interface Guess {
  round_id: string
  member_id: string
  value: number
}

/**
 * Frekans (Wavelength).
 * Bir kişi 0-100 arasında gizli bir noktayı görür ve tek kelimelik bir ipucu
 * verir; herkes kadranı kaydırır. Gizli nokta `wave_targets` tablosunda ve RLS
 * onu yalnızca ipucu veren kişiye gösterir.
 */
export default function WavelengthStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const [rounds, setRounds] = useState<Round[]>([])
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [target, setTarget] = useState<number | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [dial, setDial] = useState(50)
  const [clue, setClue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pairIdx, setPairIdx] = useState(0)
  const [psychic, setPsychic] = useState('')

  const round = rounds.find((r) => r.phase !== 'revealed') ?? rounds[rounds.length - 1] ?? null

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      const [{ data: r }, { data: g }, { data: m }] = await Promise.all([
        supabase.from('wave_rounds').select('*').eq('stage_id', stage.id).order('order_index'),
        supabase.from('wave_guesses').select('round_id, member_id, value'),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
      ])
      if (cancelled) return
      setRounds((r as Round[]) ?? [])
      setGuesses((g as Guess[]) ?? [])
      setMembers((m as Member[]) ?? [])
    }
    load()
    const channel = liveChannel(`wave-${stage.id}`, ['wave_rounds', 'wave_guesses'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  // the target comes back only if RLS allows it (psychic, or revealed)
  useEffect(() => {
    if (!round) {
      setTarget(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('wave_targets')
        .select('target')
        .eq('round_id', round.id)
        .maybeSingle()
      if (!cancelled) setTarget((data as { target: number } | null)?.target ?? null)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only id/phase matter;
    // depending on the whole `round` object would refire on every unrelated field.
  }, [round?.id, round?.phase])

  useEffect(() => {
    if (round?.phase === 'revealed') playReveal()
  }, [round?.phase])

  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—'
  const roundGuesses = round ? guesses.filter((g) => g.round_id === round.id) : []
  const myGuess = roundGuesses.find((g) => g.member_id === member?.id)
  const amPsychic = round?.psychic_member_id === member?.id
  const revealed = round?.phase === 'revealed'

  async function startRound() {
    const pair = SPECTRUM_PAIRS[pairIdx % SPECTRUM_PAIRS.length]
    const who = psychic || members[0]?.id
    if (!who) return
    setError(null)
    const { error: e } = await supabase.rpc('start_wave_round', {
      p_stage_id: stage.id,
      p_left: pair.left,
      p_right: pair.right,
      p_psychic: who,
    })
    if (e) setError('Tur başlatılamadı.')
    else setPairIdx((i) => i + 1)
  }

  async function sendClue() {
    if (!round || !clue.trim()) return
    setError(null)
    const { error: e } = await supabase.rpc('give_wave_clue', { p_round_id: round.id, p_clue: clue })
    if (e) setError('İpucu verilemedi.')
    else setClue('')
  }

  async function sendGuess() {
    if (!round) return
    setError(null)
    const { error: e } = await supabase.rpc('guess_wave', { p_round_id: round.id, p_value: dial })
    if (e) {
      setError(e.message.includes('psychic') ? 'İpucu veren tahmin etmez.' : 'Kaydedilemedi.')
    } else {
      playConfirm()
    }
  }

  async function reveal() {
    if (!round) return
    const { error: e } = await supabase.rpc('reveal_wave', { p_round_id: round.id })
    if (e) setError('Açılamadı.')
  }

  const hostPanel = isHost && !presenter && (
    <section className="card flex flex-col gap-3">
      <h4 className="font-bold text-sm">Şoför</h4>
      {round && round.phase === 'guess' && (
        <button className="btn-coral text-sm self-start" onClick={reveal}>
          Hedefi aç ve puanla ({roundGuesses.length} tahmin)
        </button>
      )}
      <div className="flex items-end gap-2 flex-wrap">
        <label className="flex flex-col gap-1 flex-1 min-w-40">
          <span className="text-xs font-semibold text-ink-soft">İpucu verecek kişi</span>
          <select className="input-blob" value={psychic} onChange={(e) => setPsychic(e.target.value)}>
            <option value="">— seç —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-coral" onClick={startRound} disabled={!psychic && !members.length}>
          Yeni tur
        </button>
      </div>
      <p className="text-xs text-ink-soft">
        Sıradaki spektrum: {SPECTRUM_PAIRS[pairIdx % SPECTRUM_PAIRS.length].left} ↔{' '}
        {SPECTRUM_PAIRS[pairIdx % SPECTRUM_PAIRS.length].right}
      </p>
    </section>
  )

  if (!round) {
    return (
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <p className="text-center text-ink-soft">
          {isHost ? 'Tur yok — aşağıdan başlat.' : 'Şoför turu hazırlıyor…'}
        </p>
        {hostPanel}
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
      )}

      <section className="card flex flex-col gap-4">
        <div className="flex items-center justify-between text-sm font-extrabold">
          <span className="text-coral">{round.left_label}</span>
          <span className="text-sky">{round.right_label}</span>
        </div>

        {/* spektrum */}
        <div className="relative h-14 rounded-full overflow-hidden border-2 border-line bg-gradient-to-r from-coral via-amber to-sky">
          {/* gizli hedef — sadece ipucu verene veya açılışta */}
          {target != null && (
            <div
              className="absolute inset-y-0 w-1.5 bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.35)]"
              style={{ left: `calc(${target}% - 3px)` }}
              title={`Hedef: ${target}`}
            />
          )}
          {/* tahminler açılışta görünür */}
          {revealed &&
            roundGuesses.map((g) => (
              <div
                key={g.member_id}
                className="absolute top-1 size-4 rounded-full bg-ink/80 ring-2 ring-white"
                style={{ left: `calc(${g.value}% - 8px)` }}
                title={`${nameOf(g.member_id)}: ${g.value}`}
              />
            ))}
          {/* kendi kadranın */}
          {!revealed && !amPsychic && (
            <div
              className="absolute inset-y-0 w-1 bg-ink"
              style={{ left: `calc(${myGuess?.value ?? dial}% - 2px)` }}
            />
          )}
        </div>

        {round.phase === 'clue' ? (
          amPsychic ? (
            !presenter && (
              <div className="flex flex-col gap-2">
                <p className="font-bold">
                  Gizli hedefi görüyorsun ({target}). Tek kelimelik bir ipucu ver.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    className="input-blob flex-1"
                    value={clue}
                    onChange={(e) => setClue(e.target.value)}
                    placeholder="İpucun…"
                    maxLength={120}
                    onKeyDown={(e) => e.key === 'Enter' && sendClue()}
                  />
                  <button className="btn-coral" onClick={sendClue} disabled={!clue.trim()}>
                    Ver
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="text-center font-bold text-ink-soft">
              🤔 {nameOf(round.psychic_member_id)} ipucu düşünüyor…
            </p>
          )
        ) : (
          <>
            <p className={['text-center font-extrabold', presenter ? 'text-4xl' : 'text-2xl'].join(' ')}>
              “{round.clue}”
            </p>
            {!revealed && !amPsychic && !presenter && (
              <div className="flex flex-col gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={myGuess?.value ?? dial}
                  onChange={(e) => setDial(Number(e.target.value))}
                  disabled={!!myGuess}
                  className="w-full accent-coral"
                />
                {myGuess ? (
                  <p className="text-center font-bold text-teal">✅ Tahminin: {myGuess.value}</p>
                ) : (
                  <button className="btn-coral self-center" onClick={sendGuess}>
                    {dial} olarak gönder
                  </button>
                )}
              </div>
            )}
            {!revealed && amPsychic && (
              <p className="text-center text-sm font-semibold text-ink-soft">
                {roundGuesses.length}/{members.length - 1} kişi tahmin etti.
              </p>
            )}
            {revealed && (
              <ul className="flex flex-col gap-1 text-sm">
                {[...roundGuesses]
                  .sort((a, b) => Math.abs(a.value - (target ?? 0)) - Math.abs(b.value - (target ?? 0)))
                  .map((g, i) => {
                    const d = Math.abs(g.value - (target ?? 0))
                    return (
                      <li key={g.member_id} className="flex justify-between rounded-xl bg-bg px-3 py-1.5">
                        <span className="font-semibold">
                          {i === 0 ? '🎯 ' : ''}
                          {nameOf(g.member_id)}
                        </span>
                        <span className="tabular-nums text-ink-soft">
                          {g.value} · {d} sapma
                          {d <= 3 ? ' · 1000' : d <= 8 ? ' · 600' : d <= 15 ? ' · 300' : ' · 0'}
                        </span>
                      </li>
                    )
                  })}
              </ul>
            )}
          </>
        )}
      </section>

      {hostPanel}
    </div>
  )
}
