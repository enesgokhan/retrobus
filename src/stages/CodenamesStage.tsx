import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import { drawBoard } from '../content/tr/codenames'
import { fireConfetti } from '../lib/celebrate'
import StageHeader from '../components/StageHeader'
import Alert from '../components/ui/Alert'
import type { Member, Stage } from '../lib/types'

interface Game {
  id: string
  phase: 'lobby' | 'playing' | 'done'
  turn: 'red' | 'blue'
  starting_team: 'red' | 'blue'
  winner: 'red' | 'blue' | null
  win_reason: string | null
  clue_word: string | null
  clue_count: number | null
  guesses_left: number
  guesses_made: number
}
interface Player {
  game_id: string
  member_id: string
  team: 'red' | 'blue'
  is_spymaster: boolean
}
interface Card {
  id: string
  word: string
  position: number
  revealed: boolean
}

/**
 * Kelime Ajanları (Codenames TR) — resmi kurallara göre.
 *
 * Anahtar kart ASLA operatörün tarayıcısına gitmez: `cn_keys` üzerindeki RLS
 * politikası onu yalnızca o oyunun spymaster'larına verir. İstemcide filtreleme
 * yok — devtools açan biri hiçbir şey göremez çünkü veri hiç gelmez.
 *
 * Arayüz, gerçek Codenames uygulamasından üç şey alıyor:
 *   * spymaster ↔ operatör görünüm anahtarı (spymaster takımının ne gördüğünü
 *     kontrol edebilsin)
 *   * kalan kart sayıları ve sıra, tahtanın üstünde büyük
 *   * renk körlüğüne dayanıklı işaretler: her rol ayrıca bir harf/simge taşır,
 *     yalnızca renkle ayrılmaz
 */
/**
 * Team colours are semantic, not decorative — they name the two sides — so they
 * stay saturated. The neutral and assassin cards had to be rebuilt for the dark
 * system: `bg-label text-white` was white-on-white once ink became a light token.
 */
const ROLE_MARK: Record<string, { mark: string; label: string; cls: string }> = {
  red: { mark: '🔴', label: 'Kırmızı', cls: 'bg-coral text-[#1a0806] shadow-[inset_0_0_0_1px_var(--color-coral-deep)]' },
  blue: { mark: '🔵', label: 'Mavi', cls: 'bg-sky text-[#04101f] shadow-[inset_0_0_0_1px_#3d7fd0]' },
  neutral: { mark: '⬜', label: 'Tarafsız', cls: 'bg-[#2a2721] text-label-2 shadow-[inset_0_0_0_1px_#3a352c]' },
  assassin: { mark: '💀', label: 'Suikastçı', cls: 'bg-black text-[#ff8a7a] shadow-[inset_0_0_0_2px_#6b2a24]' },
}

export default function CodenamesStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [keys, setKeys] = useState<{ card_id: string; role: string }[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [clue, setClue] = useState({ word: '', count: 1 })
  const [error, setError] = useState<string | null>(null)
  const [restartArmed, setRestartArmed] = useState(false)
  const [restartAt, setRestartAt] = useState(0)
  const [celebrated, setCelebrated] = useState<string | null>(null)
  /** spymasters can flip to what their team sees — the real app does this */
  const [asOperative, setAsOperative] = useState(false)

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      const { data: g } = await supabase
        .from('cn_games')
        .select('id, phase, turn, starting_team, winner, win_reason, clue_word, clue_count, guesses_left, guesses_made')
        .eq('stage_id', stage.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      const gg = (g as Game) ?? null
      setGame(gg)
      if (!gg) {
        setPlayers([]); setCards([]); setKeys([])
        return
      }
      const [{ data: p }, { data: cd }, { data: k }, { data: m }] = await Promise.all([
        supabase.from('cn_players').select('*').eq('game_id', gg.id),
        supabase.from('cn_cards').select('id, word, position, revealed').eq('game_id', gg.id).order('position'),
        // RLS decides: spymasters get all 25, everyone else only flipped cards
        supabase.from('cn_keys').select('card_id, role').eq('game_id', gg.id),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
      ])
      if (cancelled) return
      setPlayers((p as Player[]) ?? [])
      setCards((cd as Card[]) ?? [])
      setKeys((k as { card_id: string; role: string }[]) ?? [])
      setMembers((m as Member[]) ?? [])
    }
    load()
    const channel = liveChannel(`cn-${stage.id}`, ['cn_games', 'cn_players', 'cn_cards', 'stages'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  useEffect(() => {
    if (game?.phase === 'done' && game.winner && celebrated !== game.id) {
      setCelebrated(game.id)
      fireConfetti()
    }
  }, [game?.phase, game?.winner, game?.id, celebrated])

  const me = players.find((p) => p.member_id === member?.id) ?? null
  const amSpymaster = me?.is_spymaster ?? false
  /** spymaster who has NOT flipped to operative view.
   *  Never on the presenter screen: /sunum is shared to the whole call, and if
   *  the projecting session happens to be a spymaster's, this paints all 25
   *  colours — including the assassin — on the wall for both teams. */
  const seeingKey = amSpymaster && !asOperative && !presenter
  const keyOf = (cardId: string) => keys.find((k) => k.card_id === cardId)?.role ?? null
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—'

  const totalFor = (team: 'red' | 'blue') => (game?.starting_team === team ? 9 : 8)
  const flippedFor = (team: 'red' | 'blue') =>
    cards.filter((c) => c.revealed && keyOf(c.id) === team).length
  const leftFor = (team: 'red' | 'blue') => totalFor(team) - flippedFor(team)

  /** Host-only escape for a turn that will never come — see cn_host_pass. */
  async function forcePass() {
    if (!game) return
    const { error: e } = await supabase.rpc('cn_host_pass', { p_game_id: game.id })
    if (e) setError('Sıra geçirilemedi.')
  }
  async function newGame() {
    const { error: e } = await supabase.from('cn_games').insert({ stage_id: stage.id })
    if (e) setError('Oyun kurulamadı.')
  }
  async function join(team: 'red' | 'blue', spymaster: boolean) {
    setError(null)
    const { error: e } = await supabase.rpc('cn_join', {
      p_game_id: game!.id, p_team: team, p_spymaster: spymaster,
    })
    if (e) {
      setError(
        e.message.includes('spymaster') ? 'O takımın spymaster’ı var.'
        : e.message.includes('started') ? 'Oyun başladı.'
        : 'Katılınamadı.',
      )
    }
  }
  async function deal() {
    setError(null)
    const { error: e } = await supabase.rpc('cn_deal', { p_game_id: game!.id, p_words: drawBoard(25) })
    if (e) setError(e.message.includes('spymaster') ? 'Her iki takımın da spymaster’ı olmalı.' : 'Dağıtılamadı.')
  }
  async function giveClue() {
    if (!clue.word.trim()) return
    setError(null)
    const { error: e } = await supabase.rpc('cn_clue', {
      p_game_id: game!.id, p_word: clue.word, p_count: clue.count,
    })
    if (e) {
      setError(
        e.message.includes('on the board') ? 'Bu kelime tahtada duruyor — kural gereği ipucu olamaz.'
        : e.message.includes('single word') ? 'İpucu tek kelime olmalı.'
        : e.message.includes('turn') ? 'Sıra sende değil.'
        : 'İpucu verilemedi.',
      )
    } else {
      setClue({ word: '', count: 1 })
    }
  }
  async function guessCard(cardId: string) {
    setError(null)
    const { error: e } = await supabase.rpc('cn_guess', { p_card_id: cardId })
    if (e) {
      setError(
        e.message.includes('turn') ? 'Sıra sende değil.'
        : e.message.includes('clue') ? 'İpucu bekleniyor.'
        : e.message.includes('spymaster') ? 'Spymaster tahmin etmez.'
        : 'Seçilemedi.',
      )
      return
    }
  }
  async function pass() {
    setError(null)
    const { error: e } = await supabase.rpc('cn_pass', { p_game_id: game!.id })
    if (e) {
      setError(
        e.message.includes('at least once')
          ? 'Kural: pas geçmeden önce en az bir tahmin yapmalısın.'
          : 'Pas geçilemedi.',
      )
    }
  }
  async function award() {
    const { error: e } = await supabase.rpc('cn_award', { p_game_id: game!.id })
    setError(e ? 'Puanlanamadı.' : null)
  }

  // ---------- no game ----------
  if (!game) {
    return (
      <div className="w-full max-w-4xl flex-1 flex flex-col gap-4">
        <StageHeader
          phase="Kelime Ajanları"
          instruction={isHost ? 'Oyunu kur, sonra herkes takımını seçsin.' : 'Oyun kuruluyor.'}
          waiting={!isHost}
          presenter={presenter}
        />
        {isHost && !presenter && (
          <button className="btn-filled btn-lg self-start" onClick={newGame}>
            Yeni oyun kur
          </button>
        )}
      </div>
    )
  }

  // ---------- lobby ----------
  if (game.phase === 'lobby') {
    const redSm = players.find((p) => p.team === 'red' && p.is_spymaster)
    const blueSm = players.find((p) => p.team === 'blue' && p.is_spymaster)
    const redOp = players.find((p) => p.team === 'red' && !p.is_spymaster)
    const blueOp = players.find((p) => p.team === 'blue' && !p.is_spymaster)
    // Both roles on both teams. A team with a spymaster but no operative
    // deadlocks the moment its turn arrives: spymasters may not guess and may
    // not pass, so nobody on that team can legally act.
    const canDeal = !!redSm && !!blueSm && !!redOp && !!blueOp
    const missing = !redSm ? 'Kırmızı takıma spymaster lazım'
      : !blueSm ? 'Mavi takıma spymaster lazım'
      : !redOp ? 'Kırmızı takıma en az bir operatör lazım'
      : !blueOp ? 'Mavi takıma en az bir operatör lazım'
      : null
    return (
      <div className="w-full max-w-4xl flex-1 flex flex-col gap-4">
        <StageHeader
          phase="Takım seçimi"
          instruction={
            me
              ? `${me.team === 'red' ? 'Kırmızı' : 'Mavi'} takımdasın${me.is_spymaster ? ' — spymaster' : ''}.`
              : 'Bir takım ve rol seç.'
          }
          progress={`${players.length}/${members.length}`}
          presenter={presenter}
        />
        {error && (
          <Alert>{error}</Alert>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {(['red', 'blue'] as const).map((team) => {
            const roster = players.filter((p) => p.team === team)
            const sm = roster.find((p) => p.is_spymaster)
            return (
              <section
                key={team}
                className="card flex flex-col gap-2"
                style={{
                  // The team's own colour as a wash and a lit top edge — not a
                  // leading rail. The heading already carries the team colour
                  // and a dot beside it, so the identity is stated twice
                  // without the one device this design system treats as a tell.
                  background: `color-mix(in srgb, var(--color-${team === 'red' ? 'coral' : 'sky'}) 8%, var(--color-bg-1))`,
                  boxShadow: `inset 0 1px 0 color-mix(in srgb, var(--color-${team === 'red' ? 'coral' : 'sky'}) 45%, transparent), var(--shadow-1)`,
                }}
              >
                <h3 className={['font-semibold flex items-center gap-2', team === 'red' ? 'text-coral' : 'text-sky'].join(' ')}>
                  <span
                aria-hidden
                className="size-2.5 rounded-full shrink-0"
                style={{ background: team === 'red' ? 'var(--color-coral)' : 'var(--color-sky)' }}
              />
                  {team === 'red' ? 'Kırmızı' : 'Mavi'}
                  <span className="text-label-2 font-semibold">({roster.length})</span>
                </h3>
                <ul className="text-subhead flex flex-col gap-1 min-h-16">
                  {roster.map((p) => (
                    <li key={p.member_id} className="font-semibold">
                      {p.is_spymaster ? '🕵️ ' : '👤 '}
                      {nameOf(p.member_id)}
                      {p.member_id === member?.id && <span className="text-label-2"> (sen)</span>}
                    </li>
                  ))}
                  {!roster.length && <li className="text-label-2">boş</li>}
                </ul>
                {!presenter && (
                  <div className="flex gap-2">
                    <button className="btn-gray text-footnote flex-1" onClick={() => join(team, false)}>
                      Operatör
                    </button>
                    <button
                      className="btn-gray text-footnote flex-1"
                      onClick={() => join(team, true)}
                      disabled={!!sm && sm.member_id !== member?.id}
                    >
                      Spymaster
                    </button>
                  </div>
                )}
              </section>
            )
          })}
        </div>
        <p className="text-footnote font-semibold text-label-2">
          {canDeal ? 'Takımlar hazır — dağıtabilirsin.' : `${missing}.`}
        </p>
        {isHost && !presenter && (
          <button className="btn-filled btn-lg self-start" onClick={deal} disabled={!canDeal}>
            Tahtayı dağıt
          </button>
        )}
      </div>
    )
  }

  // ---------- board ----------
  const myTurn = !!me && !me.is_spymaster && me.team === game.turn && !!game.clue_word
  const iGiveClue = amSpymaster && me?.team === game.turn && !game.clue_word
  const unlimited = (game.clue_count ?? 1) <= 0

  const header = (() => {
    if (game.phase === 'done') {
      return {
        phase: 'Oyun bitti',
        instruction: `🏆 ${game.winner === 'red' ? 'Kırmızı' : 'Mavi'} kazandı${
          game.win_reason === 'assassin' ? ' — suikastçı açıldı!' : ''
        }`,
        waiting: false,
      }
    }
    if (iGiveClue && !presenter) {
      return { phase: 'Senin sıran · spymaster', instruction: 'Tek kelime ipucu ve sayı ver.', waiting: false }
    }
    if (myTurn && !presenter) {
      return {
        phase: 'Senin sıran · operatör',
        instruction: `“${game.clue_word}” ${unlimited ? '(sınırsız)' : game.clue_count} — bir kelimeye bas.`,
        waiting: false,
      }
    }
    if (amSpymaster && me?.team === game.turn && !presenter) {
      return { phase: 'Takımın tahmin ediyor', instruction: 'Sessiz kal — ipucu verdin.', waiting: true }
    }
    if (!game.clue_word) {
      return {
        phase: `${game.turn === 'red' ? 'Kırmızının' : 'Mavinin'} sırası`,
        instruction: 'Spymaster ipucu düşünüyor…',
        waiting: true,
      }
    }
    return {
      phase: `${game.turn === 'red' ? 'Kırmızı' : 'Mavi'} tahmin ediyor`,
      instruction: `“${game.clue_word}” ${unlimited ? '(sınırsız)' : game.clue_count}`,
      waiting: true,
    }
  })()

  return (
    <div className="w-full max-w-5xl flex-1 flex flex-col gap-3">
      <StageHeader
        {...header}
        presenter={presenter}
        progress={
          game.phase === 'playing' && game.clue_word && !unlimited
            ? `${game.guesses_left} tahmin`
            : null
        }
        aside={
          amSpymaster && !presenter ? (
            <button
              className="btn-gray text-footnote shrink-0"
              onClick={() => setAsOperative((v) => !v)}
              title="Takımının ne gördüğünü kontrol et"
            >
              {asOperative ? 'Anahtarı göster' : 'Takım görünümü'}
            </button>
          ) : null
        }
      />

      {error && (
        <Alert>{error}</Alert>
      )}

      {/* kalan kartlar + sıra, gerçek uygulamada olduğu gibi tahtanın üstünde */}
      <section className="flex items-stretch gap-2">
        {(['red', 'blue'] as const).map((team) => (
          <div
            key={team}
            className={[
              // Whose turn it is is stated by a tint wash and a leading bar,
              // not by filling half the screen with saturated colour. A solid
              // blue slab across 700px outshouted the board it sits above.
              'flex-1 relative overflow-hidden rounded-md px-4 py-2.5 flex items-center justify-between',
              team === game.turn && game.phase === 'playing' ? '' : 'bg-bg-1',
            ].join(' ')}
            style={
              team === game.turn && game.phase === 'playing'
                ? {
                    background: `color-mix(in srgb, var(--color-${team === 'red' ? 'coral' : 'sky'}) 16%, var(--color-bg-1))`,
                    // No leading rail. That 3px coloured bar is the tell this
                    // codebase deliberately removed from every list row, and
                    // leaving it here meant the rule had been applied locally
                    // rather than adopted. The wash plus the team's own dot
                    // already say whose turn it is.
                    boxShadow: `inset 0 1px 0 color-mix(in srgb, var(--color-${team === 'red' ? 'coral' : 'sky'}) 40%, transparent)`,
                  }
                : undefined
            }
          >
            <span className="text-subhead flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 rounded-full shrink-0"
                style={{ background: team === 'red' ? 'var(--color-coral)' : 'var(--color-sky)' }}
              />
              {team === 'red' ? 'Kırmızı' : 'Mavi'}
              {team === game.turn && game.phase === 'playing' && (
                <span className="text-footnote text-label-2">· sıra</span>
              )}
            </span>
            <span className={['nums', presenter ? 'text-title-1' : 'text-title-3'].join(' ')}>
              {leftFor(team)}
            </span>
          </div>
        ))}
      </section>

      {/* The clue, given its own plaque. Everyone needs to read it constantly
          while they argue about the board; it used to be a fragment of a
          sentence smaller than the page title. */}
      {game.phase === 'playing' && game.clue_word && (
        <div className="card-tinted flex items-center gap-4 py-3">
          <span
            className={[
              'uppercase tracking-wide',
              presenter ? 'text-display' : 'text-title-1',
            ].join(' ')}
          >
            {game.clue_word}
          </span>
          <span
            className={[
              'shrink-0 rounded-full grid place-items-center nums bg-(--tint) text-(--tint-ink)',
              presenter ? 'size-16 text-title-2' : 'size-11 text-title-3',
            ].join(' ')}
          >
            {unlimited ? '∞' : game.clue_count}
          </span>
        </div>
      )}

      {/* 5x5 tahta */}
      <div
        className={[
          'grid grid-cols-5 gap-1.5 sm:gap-3 w-full',
          presenter ? 'max-w-6xl' : 'max-w-5xl',
        ].join(' ')}
      >
        {cards.map((c) => {
          const role = keyOf(c.id)
          const showRole = c.revealed || (seeingKey && role)
          const meta = role ? ROLE_MARK[role] : null
          const canGuess = myTurn && !c.revealed && !presenter
          return (
            <button
              key={c.id}
              className={[
                // No border. Tailwind v4 defaults `border-2` to currentColor,
                // and currentColor here is near-white text — so the board was
                // twenty-five bright outlined rectangles on near-black, which
                // is the loudest possible way to draw a grid. A card is a
                // filled surface; separation comes from the gap between them.
                // Square on a phone, 4:3 above it. At 430px a 4:3 cell is 71x53
                // and a 5x5 grid leaves ~59px of text room per tile — one line
                // only, and not a long one.
                'relative aspect-square sm:aspect-4/3 rounded-lg sm:rounded-xl',
                'font-semibold uppercase tracking-tight',
                'transition-[background-color,transform,opacity,box-shadow] duration-150',
                'flex items-center justify-center text-center px-1 sm:px-1.5',
                // Belt and braces: the type below is sized to fit, and this
                // guarantees a word can never paint outside its own tile even
                // if a longer one than we planned for turns up.
                'overflow-hidden leading-[1.1] [overflow-wrap:anywhere]',
                // Long Turkish words overflow a fixed size — HELİKOPTER ran
                // past its card on the shared screen. break-all would fix it by
                // hyphenating mid-word, which looks worse than it sounds, so the
                // type steps down instead and the word stays whole.
                // On a phone the tile is a fraction of the VIEWPORT, so the type
                // is too — a fixed 17px "short word" size overflowed a 71px cell
                // and BAKLAVA painted straight across OYUN next to it. From `sm`
                // up the board has room and goes back to the ramp.
                c.word.length >= 10
                  ? presenter ? 'text-2xl' : 'text-[2.1vw] sm:text-subhead lg:text-base'
                  : c.word.length >= 8
                    ? presenter ? 'text-3xl' : 'text-[2.5vw] sm:text-base lg:text-headline'
                    : presenter ? 'text-4xl' : 'text-[3vw] sm:text-xl lg:text-2xl',
                // an unrevealed card is a physical object, not a blank rectangle
                // An unrevealed card is a physical object you want to press.
                // It used to be cream with a hard bottom edge, which on the
                // dark system rendered near-white text on near-white card.
                showRole && meta ? meta.cls : 'bg-bg-2 text-label hover:bg-bg-3',
                // revealed cards SINK — the whole job is scanning what is left
                c.revealed ? 'opacity-30 saturate-[.4]' : '',
                canGuess ? 'hover:-translate-y-0.5 active:translate-y-0 cursor-pointer' : 'cursor-default',
              ].join(' ')}
              onClick={() => canGuess && guessCard(c.id)}
              disabled={!canGuess}
              title={showRole && meta ? `${c.word} — ${meta.label}` : c.word}
            >
              <span className="leading-tight break-normal hyphens-none">{c.word}</span>
              {/* renk körlüğü için: rol ayrıca simgeyle işaretli */}
              {showRole && meta && (
                <span
                  className="absolute top-1 right-1.5 text-subhead leading-none opacity-95"
                  aria-label={meta.label}
                >
                  {meta.mark}
                </span>
              )}
              {c.revealed && (
                <span className="absolute bottom-0.5 left-1 text-[10px] leading-none opacity-70" aria-hidden>
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* eylemler */}
      {game.phase === 'playing' && !presenter && (iGiveClue || myTurn) && (
        <section className="card flex flex-col gap-3">
          {iGiveClue ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  className="field flex-1 min-w-40"
                  value={clue.word}
                  onChange={(e) => setClue((c) => ({ ...c, word: e.target.value }))}
                  placeholder="Tek kelime ipucu"
                  maxLength={40}
                  onKeyDown={(e) => e.key === 'Enter' && giveClue()}
                />
                <select
                  className="field w-32"
                  value={clue.count}
                  onChange={(e) => setClue((c) => ({ ...c, count: Number(e.target.value) }))}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <option key={n} value={n}>
                      {n} kelime
                    </option>
                  ))}
                  <option value={0}>sınırsız</option>
                </select>
                <button className="btn-filled" onClick={giveClue} disabled={!clue.word.trim()}>
                  Ver
                </button>
              </div>
              <p className="text-footnote font-semibold text-label-2">
                Kural: tek kelime, tahtadaki kelimelerden biri olamaz. Takımın {clue.count > 0 ? clue.count + 1 : '∞'} tahmin
                hakkı kazanır.
              </p>
            </div>
          ) : myTurn ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-label-2 text-subhead">
                {game.guesses_made === 0
                  ? 'Kural: pas geçmeden önce en az bir tahmin yapmalısın.'
                  : `${unlimited ? 'Sınırsız' : game.guesses_left} tahmin hakkın kaldı.`}
              </span>
              <button
                className="btn-gray text-subhead"
                onClick={pass}
                disabled={game.guesses_made === 0}
                title={game.guesses_made === 0 ? 'En az bir tahmin gerekli' : 'Sırayı devret'}
              >
                Pas geç
              </button>
            </div>
          ) : null}
        </section>
      )}

      {game.phase === 'playing' && isHost && !presenter && (
        <div className="flex gap-2 justify-center flex-wrap">
          {/* The turn can stall for reasons the rules cannot fix: someone's tab
              died, a spymaster went to make tea. Without a host escape the whole
              stage deadlocks in front of everyone. */}
          <button className="btn-gray text-subhead" onClick={forcePass}>
            Sırayı diğer takıma ver
          </button>
          <button
            className="btn-gray text-subhead"
            onClick={() => {
              // a live board, both key cards and everyone's seats, one click
              // away from the pass button the host actually reaches for
              if (!restartArmed) { setRestartArmed(true); setRestartAt(Date.now()); return }
              if (Date.now() - restartAt < 700) return
              setRestartArmed(false)
              void newGame()
            }}
            onBlur={() => setRestartArmed(false)}
          >
            {restartArmed ? 'Tahta ve roller sıfırlanacak — bas' : 'Oyunu baştan kur'}
          </button>
        </div>
      )}

      {game.phase === 'done' && isHost && !presenter && (
        <div className="flex gap-2 justify-center flex-wrap">
          <button className="btn-filled" onClick={award}>
            Kazanan takıma puan ver
          </button>
          <button className="btn-gray" onClick={newGame}>
            Yeni oyun
          </button>
        </div>
      )}

      {seeingKey && !presenter && (
        <p className="text-footnote font-semibold text-grape">
          Anahtarı görüyorsun. Takımının ne gördüğünü kontrol etmek için “Takım görünümü”ne bas.
        </p>
      )}
    </div>
  )
}
