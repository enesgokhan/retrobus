import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import { SPECTRUM_PAIRS } from '../content/tr/spectrums'
import { fireConfetti } from '../lib/celebrate'
import StageHeader from '../components/StageHeader'
import type { Member, Stage } from '../lib/types'

interface Round {
  id: string
  left_label: string
  right_label: string
  psychic_member_id: string
  clue: string | null
  phase: 'clue' | 'guess' | 'bet' | 'revealed'
  order_index: number
  active_team: 'a' | 'b'
  team_dial: number | null
}
interface Guess {
  round_id: string
  member_id: string
  value: number
}
interface Bet {
  round_id: string
  member_id: string
  side: 'left' | 'right'
}

type Teams = Record<string, 'a' | 'b'>

/**
 * Frekans (Wavelength) — gerçek kurallara göre, iki takımlı.
 *
 * Akış:
 *   1. Aktif takımın medyumu gizli hedefi görür, TEK kelimelik ipucu verir.
 *   2. Aktif takım kadranı belirler. (Uzaktan uyarlama: herkes kendi kadranını
 *      koyar, takımın kadranı MEDYAN olur — tek kadranı bir kişinin sürüklemesi
 *      görüntülü görüşmede kötü çalışıyor.)
 *   3. KARŞI TAKIM, gerçek merkezin kadranın soluna mı sağına mı düştüğüne
 *      bahse girer. Bu adım oyunun yarısı: onsuz odanın yarısı boş oturuyor.
 *   4. Açılış: kadran hedefin hangi bandına düştüyse 4/3/2 puan, doğru bahis +1.
 */
const BANDS = [
  { within: 5, points: 1000, label: '4 puan' },
  { within: 12, points: 750, label: '3 puan' },
  { within: 20, points: 500, label: '2 puan' },
]

export default function WavelengthStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const [rounds, setRounds] = useState<Round[]>([])
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [bets, setBets] = useState<Bet[]>([])
  const [target, setTarget] = useState<number | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [dial, setDial] = useState(50)
  const [clue, setClue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pairIdx, setPairIdx] = useState(0)
  const [psychic, setPsychic] = useState('')
  const [celebrated, setCelebrated] = useState<string | null>(null)

  const teams = (stage.config.teams as Teams | undefined) ?? {}
  const myTeam = member ? teams[member.id] : undefined
  const round = rounds.find((r) => r.phase !== 'revealed') ?? rounds[rounds.length - 1] ?? null

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      const [{ data: r }, { data: m }] = await Promise.all([
        supabase.from('wave_rounds').select('*').eq('stage_id', stage.id).order('order_index'),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
      ])
      if (cancelled) return
      const list = (r as Round[]) ?? []
      setRounds(list)
      setMembers((m as Member[]) ?? [])
      const ids = list.map((x) => x.id)
      if (!ids.length) {
        setGuesses([]); setBets([])
        return
      }
      const [{ data: g }, { data: b }] = await Promise.all([
        supabase.from('wave_guesses').select('round_id, member_id, value').in('round_id', ids),
        supabase.from('wave_bets').select('round_id, member_id, side').in('round_id', ids),
      ])
      if (cancelled) return
      setGuesses((g as Guess[]) ?? [])
      setBets((b as Bet[]) ?? [])
    }
    load()
    const channel = liveChannel(`wave-${stage.id}`, ['wave_rounds', 'wave_guesses', 'wave_bets'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  // the target only comes back if RLS allows it: psychic, or after reveal
  useEffect(() => {
    if (!round) {
      setTarget(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('wave_targets').select('target').eq('round_id', round.id).maybeSingle()
      if (!cancelled) setTarget((data as { target: number } | null)?.target ?? null)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id/phase are what matter
  }, [round?.id, round?.phase])

  useEffect(() => {
    if (round?.phase === 'revealed' && celebrated !== round.id) {
      setCelebrated(round.id)
      const d = round.team_dial
      if (d != null && target != null && Math.abs(d - target) <= 5) fireConfetti(90)
    }
  }, [round?.phase, round?.id, round?.team_dial, target, celebrated])

  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—'
  const roundGuesses = round ? guesses.filter((g) => g.round_id === round.id) : []
  const roundBets = round ? bets.filter((b) => b.round_id === round.id) : []
  const myGuess = roundGuesses.find((g) => g.member_id === member?.id)
  const myBet = roundBets.find((b) => b.member_id === member?.id)
  const amPsychic = round?.psychic_member_id === member?.id
  const onActiveTeam = round ? myTeam === round.active_team : false
  const revealed = round?.phase === 'revealed'

  const activeTeamSize = round
    ? members.filter((m) => teams[m.id] === round.active_team && m.id !== round.psychic_member_id).length
    : 0
  const otherTeamSize = round
    ? members.filter((m) => teams[m.id] && teams[m.id] !== round.active_team).length
    : 0

  /** Auto-split the roster into two teams, alternating for balance. */
  async function autoTeams() {
    const next: Teams = {}
    members.forEach((m, i) => {
      next[m.id] = i % 2 === 0 ? 'a' : 'b'
    })
    await supabase.from('stages').update({ config: { ...stage.config, teams: next } }).eq('id', stage.id)
  }
  async function swapTeam(memberId: string) {
    const next: Teams = { ...teams, [memberId]: teams[memberId] === 'a' ? 'b' : 'a' }
    await supabase.from('stages').update({ config: { ...stage.config, teams: next } }).eq('id', stage.id)
  }

  async function startRound() {
    if (!psychic) {
      setError('Önce ipucu verecek kişiyi seç.')
      return
    }
    if (!Object.keys(teams).length) {
      setError('Önce takımları oluştur.')
      return
    }
    const pair = SPECTRUM_PAIRS[pairIdx % SPECTRUM_PAIRS.length]
    setError(null)
    const { error: e } = await supabase.rpc('start_wave_round', {
      p_stage_id: stage.id, p_left: pair.left, p_right: pair.right, p_psychic: psychic,
    })
    if (e) { setError('Tur başlatılamadı.'); return }
    setPairIdx((i) => i + 1)
    // rotate the psychic to the OTHER team so turns alternate like the real game
    const cur = teams[psychic]
    const candidates = members.filter((m) => teams[m.id] && teams[m.id] !== cur)
    setPsychic(candidates[0]?.id ?? '')
  }

  async function sendClue() {
    if (!round || !clue.trim()) return
    setError(null)
    const { error: e } = await supabase.rpc('give_wave_clue', { p_round_id: round.id, p_clue: clue })
    if (e) setError('İpucu verilemedi.')
    else { setClue(''); }
  }
  async function sendGuess() {
    if (!round) return
    setError(null)
    const { error: e } = await supabase.rpc('guess_wave', { p_round_id: round.id, p_value: dial })
    if (e) {
      setError(
        e.message.includes('active team') ? 'Kadranı yalnızca aktif takım belirler.'
        : e.message.includes('psychic') ? 'İpucu veren tahmin etmez.'
        : 'Kaydedilemedi.',
      )
    }
  }
  async function closeDial() {
    if (!round) return
    const { error: e } = await supabase.rpc('close_wave_dial', { p_round_id: round.id })
    if (e) setError(e.message.includes('nobody') ? 'Henüz kimse kadran koymadı.' : 'Kapatılamadı.')
  }
  async function sendBet(side: 'left' | 'right') {
    if (!round) return
    setError(null)
    const { error: e } = await supabase.rpc('bet_wave', { p_round_id: round.id, p_side: side })
    if (e) setError(e.message.includes('opposing') ? 'Bahsi yalnızca karşı takım yapar.' : 'Kaydedilemedi.')
  }
  async function reveal() {
    if (!round) return
    const { error: e } = await supabase.rpc('reveal_wave', { p_round_id: round.id })
    if (e) setError('Açılamadı.')
  }

  const teamLabel = (t?: string) => (t === 'a' ? '🟣 A takımı' : t === 'b' ? '🟠 B takımı' : '—')

  const hostPanel = isHost && !presenter && (
    <section className="card flex flex-col gap-3">
      <h4 className="font-bold text-sm">Şoför</h4>
      {round && round.phase === 'guess' && (
        <button className="btn-coral text-sm self-start" onClick={closeDial}>
          🔒 Kadranı kilitle ({roundGuesses.length}/{activeTeamSize}) → bahis
        </button>
      )}
      {round && round.phase === 'bet' && (
        <button className="btn-coral text-sm self-start" onClick={reveal}>
          🎯 Hedefi aç ve puanla ({roundBets.length}/{otherTeamSize} bahis)
        </button>
      )}
      {round && round.phase === 'clue' && (
        <p className="text-xs text-ink-soft">{nameOf(round.psychic_member_id)} ipucu veriyor…</p>
      )}

      {!Object.keys(teams).length ? (
        <button className="btn-coral self-start text-sm" onClick={autoTeams}>
          👥 Takımları otomatik kur
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <button
                key={m.id}
                className={[
                  'rounded-full px-2.5 py-1 text-xs font-bold border-2',
                  teams[m.id] === 'a' ? 'bg-grape-soft border-grape' : 'bg-amber-soft border-amber',
                ].join(' ')}
                onClick={() => swapTeam(m.id)}
                title="Takımını değiştir"
              >
                {teams[m.id] === 'a' ? '🟣' : '🟠'} {m.display_name}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-1 flex-1 min-w-40">
              <span className="text-xs font-semibold text-ink-soft">Sıradaki medyum</span>
              <select className="input-blob" value={psychic} onChange={(e) => setPsychic(e.target.value)}>
                <option value="">— seç —</option>
                {members.filter((m) => teams[m.id]).map((m) => (
                  <option key={m.id} value={m.id}>
                    {teams[m.id] === 'a' ? '🟣' : '🟠'} {m.display_name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-coral" onClick={startRound} disabled={!psychic}>
              Yeni tur
            </button>
          </div>
          <p className="text-xs text-ink-soft">
            Sıradaki spektrum: {SPECTRUM_PAIRS[pairIdx % SPECTRUM_PAIRS.length].left} ↔{' '}
            {SPECTRUM_PAIRS[pairIdx % SPECTRUM_PAIRS.length].right}
          </p>
        </div>
      )}
    </section>
  )

  if (!round) {
    return (
      <div className="w-full max-w-4xl flex flex-col gap-4">
        <StageHeader
          phase="Frekans"
          instruction={isHost ? 'Takımları kur ve ilk turu başlat.' : 'Şoför turu hazırlıyor…'}
          waiting={!isHost}
          presenter={presenter}
        />
        {hostPanel}
      </div>
    )
  }

  // --- what should THIS person do right now? ---
  const header = (() => {
    if (revealed) {
      const d = round.team_dial
      const dist = d != null && target != null ? Math.abs(d - target) : null
      const band = dist == null ? null : BANDS.find((b) => dist <= b.within)
      return {
        phase: 'Sonuç',
        instruction: band
          ? `Kadran ${d}, hedef ${target} — ${band.label}!`
          : `Kadran ${d}, hedef ${target} — bu tur puan yok.`,
        waiting: false,
      }
    }
    if (round.phase === 'clue') {
      return amPsychic
        ? { phase: 'Sen medyumsun', instruction: `Hedef ${target}. Tek kelimeyle anlat.`, waiting: false }
        : { phase: `${teamLabel(round.active_team)} turu`, instruction: `${nameOf(round.psychic_member_id)} ipucu düşünüyor…`, waiting: true }
    }
    if (round.phase === 'guess') {
      if (amPsychic) return { phase: 'Takımın kadranı ayarlıyor', instruction: 'Sessiz kal — ipucunu verdin.', waiting: true }
      if (onActiveTeam) {
        return myGuess
          ? { phase: 'Kadranın kayıtlı', instruction: `${myGuess.value} dedin. Takımın medyanı alınacak.`, waiting: true }
          : { phase: 'Senin sıran', instruction: `“${round.clue}” — kadranı kaydır ve gönder.`, waiting: false }
      }
      return { phase: 'Karşı takımı bekle', instruction: 'Onlar kadranı ayarlıyor, sonra sen bahse gireceksin.', waiting: true }
    }
    // bet phase
    if (onActiveTeam || amPsychic) {
      return { phase: 'Bahis zamanı', instruction: 'Karşı takım sol/sağ tahmin ediyor.', waiting: true }
    }
    return myBet
      ? { phase: 'Bahsin kayıtlı', instruction: `${myBet.side === 'left' ? 'Sol' : 'Sağ'} dedin.`, waiting: true }
      : { phase: 'Senin bahsin', instruction: 'Gerçek merkez kadranın solunda mı sağında mı?', waiting: false }
  })()

  const correctSide = revealed && target != null && round.team_dial != null
    ? target < round.team_dial ? 'left' : 'right'
    : null

  return (
    <div className="w-full max-w-4xl flex flex-col gap-4">
      <StageHeader
        {...header}
        presenter={presenter}
        progress={
          round.phase === 'guess' ? `${roundGuesses.length}/${activeTeamSize}`
          : round.phase === 'bet' ? `${roundBets.length}/${otherTeamSize}`
          : null
        }
      />

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
      )}

      <section className="card flex flex-col gap-4">
        <div className="flex items-center justify-between text-sm font-extrabold">
          <span className="text-coral">← {round.left_label}</span>
          <span className="text-xs text-ink-soft font-semibold">
            {teamLabel(round.active_team)} · medyum {nameOf(round.psychic_member_id)}
          </span>
          <span className="text-sky">{round.right_label} →</span>
        </div>

        {/* spektrum */}
        <div className="relative h-16 rounded-2xl overflow-hidden border-2 border-line bg-gradient-to-r from-coral via-amber to-sky">
          {/* hedef bantları — açılışta görünür, medyum her zaman görür */}
          {target != null && (
            <>
              {[...BANDS].reverse().map((b) => (
                <div
                  key={b.within}
                  className="absolute inset-y-0 bg-white/25 border-x border-white/40"
                  style={{
                    left: `${Math.max(0, target - b.within)}%`,
                    width: `${Math.min(100, target + b.within) - Math.max(0, target - b.within)}%`,
                  }}
                  aria-hidden
                />
              ))}
              <div
                className="absolute inset-y-0 w-1 bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.4)]"
                style={{ left: `calc(${target}% - 2px)` }}
                title={`Hedef: ${target}`}
              />
            </>
          )}
          {/* takım kadranı */}
          {round.team_dial != null && (
            <div
              className="absolute inset-y-0 w-1.5 bg-ink"
              style={{ left: `calc(${round.team_dial}% - 3px)` }}
              title={`Takım kadranı: ${round.team_dial}`}
            />
          )}
          {/* açılışta bireysel kadranlar */}
          {revealed &&
            roundGuesses.map((g) => (
              <div
                key={g.member_id}
                className="absolute top-1.5 size-3.5 rounded-full bg-ink/70 ring-2 ring-white"
                style={{ left: `calc(${g.value}% - 7px)` }}
                title={`${nameOf(g.member_id)}: ${g.value}`}
              />
            ))}
          {/* kendi kadranın, gönderilmeden önce */}
          {round.phase === 'guess' && onActiveTeam && !amPsychic && (
            <div
              className="absolute inset-y-0 w-1 bg-ink/80"
              style={{ left: `calc(${myGuess?.value ?? dial}% - 2px)` }}
            />
          )}
        </div>

        {round.clue && (
          <p className={['text-center font-extrabold', presenter ? 'text-5xl' : 'text-3xl'].join(' ')}>
            “{round.clue}”
          </p>
        )}

        {/* medyum ipucu yazıyor */}
        {round.phase === 'clue' && amPsychic && !presenter && (
          <div className="flex items-center gap-2">
            <input
              className="input-blob flex-1"
              value={clue}
              onChange={(e) => setClue(e.target.value)}
              placeholder="Tek kelime ipucu…"
              maxLength={120}
              onKeyDown={(e) => e.key === 'Enter' && sendClue()}
            />
            <button className="btn-coral" onClick={sendClue} disabled={!clue.trim()}>
              Ver
            </button>
          </div>
        )}

        {/* aktif takım kadranı ayarlıyor */}
        {round.phase === 'guess' && onActiveTeam && !amPsychic && !myGuess && !presenter && (
          <div className="flex flex-col gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={dial}
              onChange={(e) => setDial(Number(e.target.value))}
              className="w-full accent-coral h-6"
            />
            <button className="btn-coral self-center text-lg" onClick={sendGuess}>
              {dial} olarak gönder
            </button>
          </div>
        )}

        {/* karşı takım bahis yapıyor */}
        {round.phase === 'bet' && !onActiveTeam && !amPsychic && !presenter && (
          <div className="flex flex-col gap-2">
            <p className="text-center text-sm font-semibold text-ink-soft">
              Takım kadranı <b>{round.team_dial}</b>. Gerçek merkez hangi tarafta?
            </p>
            <div className="flex gap-3">
              {(['left', 'right'] as const).map((side) => (
                <button
                  key={side}
                  className={[
                    'flex-1 rounded-2xl border-2 py-4 font-extrabold text-lg transition',
                    myBet?.side === side ? 'bg-coral text-white border-coral-deep' : 'border-line hover:border-coral',
                  ].join(' ')}
                  onClick={() => sendBet(side)}
                >
                  {side === 'left' ? '⬅ Solunda' : 'Sağında ➡'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* sonuçlar */}
        {revealed && (
          <div className="flex flex-col gap-2">
            {correctSide && (
              <p className="text-center text-sm font-bold">
                Doğru taraf: {correctSide === 'left' ? '⬅ sol' : 'sağ ➡'} ·{' '}
                {roundBets.filter((b) => b.side === correctSide).length}/{roundBets.length} bahis doğru
              </p>
            )}
            <ul className="flex flex-col gap-1 text-sm">
              {[...roundGuesses]
                .sort((a, b) => Math.abs(a.value - (target ?? 0)) - Math.abs(b.value - (target ?? 0)))
                .map((g, i) => (
                  <li key={g.member_id} className="flex justify-between rounded-xl bg-bg px-3 py-1.5">
                    <span className="font-semibold">
                      {i === 0 ? '🎯 ' : ''}
                      {nameOf(g.member_id)}
                    </span>
                    <span className="tabular-nums text-ink-soft">
                      {g.value} · {Math.abs(g.value - (target ?? 0))} sapma
                    </span>
                  </li>
                ))}
              {roundBets.map((b) => (
                <li key={b.member_id} className="flex justify-between rounded-xl bg-bg px-3 py-1.5">
                  <span className="font-semibold">
                    {b.side === correctSide ? '✅ ' : '❌ '}
                    {nameOf(b.member_id)}
                  </span>
                  <span className="text-ink-soft">{b.side === 'left' ? 'sol' : 'sağ'} dedi</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {hostPanel}
    </div>
  )
}
