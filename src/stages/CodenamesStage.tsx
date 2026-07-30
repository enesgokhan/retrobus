import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import { drawBoard } from '../content/tr/codenames'
import { fireConfetti } from '../lib/celebrate'
import StageHeader from '../components/StageHeader'
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
const ROLE_MARK: Record<string, { mark: string; label: string; cls: string }> = {
  red: { mark: '🔴', label: 'Kırmızı', cls: 'bg-coral text-white border-coral-deep' },
  blue: { mark: '🔵', label: 'Mavi', cls: 'bg-sky text-white border-sky' },
  neutral: { mark: '⬜', label: 'Tarafsız', cls: 'bg-amber-soft text-ink border-amber' },
  assassin: { mark: '💀', label: 'Suikastçı', cls: 'bg-ink text-white border-ink' },
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
    const channel = liveChannel(`cn-${stage.id}`, ['cn_games', 'cn_players', 'cn_cards'], load)
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
  /** spymaster who has NOT flipped to operative view */
  const seeingKey = amSpymaster && !asOperative
  const keyOf = (cardId: string) => keys.find((k) => k.card_id === cardId)?.role ?? null
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—'

  const totalFor = (team: 'red' | 'blue') => (game?.starting_team === team ? 9 : 8)
  const flippedFor = (team: 'red' | 'blue') =>
    cards.filter((c) => c.revealed && keyOf(c.id) === team).length
  const leftFor = (team: 'red' | 'blue') => totalFor(team) - flippedFor(team)

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
        : e.message.includes('turn') ? 'Sıra sizde değil.'
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
        e.message.includes('turn') ? 'Sıra sizde değil.'
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
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <StageHeader
          phase="Kelime Ajanları"
          instruction={isHost ? 'Oyunu kur, sonra herkes takımını seçsin.' : 'Şoför oyunu kuruyor…'}
          waiting={!isHost}
          presenter={presenter}
        />
        {isHost && !presenter && (
          <button className="btn-coral self-center text-lg" onClick={newGame}>
            🕵️ Yeni oyun kur
          </button>
        )}
      </div>
    )
  }

  // ---------- lobby ----------
  if (game.phase === 'lobby') {
    const redSm = players.find((p) => p.team === 'red' && p.is_spymaster)
    const blueSm = players.find((p) => p.team === 'blue' && p.is_spymaster)
    const canDeal = !!redSm && !!blueSm
    return (
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <StageHeader
          phase="Takım seçimi"
          instruction={
            me
              ? `${me.team === 'red' ? '🔴 Kırmızı' : '🔵 Mavi'} takımdasın${me.is_spymaster ? ' — spymaster' : ''}.`
              : 'Bir takım ve rol seç.'
          }
          progress={`${players.length}/${members.length}`}
          presenter={presenter}
        />
        {error && (
          <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
            {error}
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {(['red', 'blue'] as const).map((team) => {
            const roster = players.filter((p) => p.team === team)
            const sm = roster.find((p) => p.is_spymaster)
            return (
              <section
                key={team}
                className={['card flex flex-col gap-2 border-2', team === 'red' ? 'border-coral' : 'border-sky'].join(' ')}
              >
                <h3 className={['font-extrabold flex items-center gap-2', team === 'red' ? 'text-coral' : 'text-sky'].join(' ')}>
                  <span aria-hidden>{team === 'red' ? '🔴' : '🔵'}</span>
                  {team === 'red' ? 'Kırmızı' : 'Mavi'}
                  <span className="text-ink-soft font-semibold">({roster.length})</span>
                </h3>
                <ul className="text-sm flex flex-col gap-1 min-h-16">
                  {roster.map((p) => (
                    <li key={p.member_id} className="font-semibold">
                      {p.is_spymaster ? '🕵️ ' : '👤 '}
                      {nameOf(p.member_id)}
                      {p.member_id === member?.id && <span className="text-ink-soft"> (sen)</span>}
                    </li>
                  ))}
                  {!roster.length && <li className="text-ink-soft">boş</li>}
                </ul>
                {!presenter && (
                  <div className="flex gap-2">
                    <button className="btn-ghost text-xs flex-1" onClick={() => join(team, false)}>
                      Operatör
                    </button>
                    <button
                      className="btn-ghost text-xs flex-1"
                      onClick={() => join(team, true)}
                      disabled={!!sm && sm.member_id !== member?.id}
                    >
                      🕵️ Spymaster
                    </button>
                  </div>
                )}
              </section>
            )
          })}
        </div>
        <p className="text-xs font-semibold text-ink-soft text-center">
          {canDeal ? '✅ İki spymaster hazır.' : '⚠️ Her takımda tam bir spymaster olmalı.'}
        </p>
        {isHost && !presenter && (
          <button className="btn-coral self-center text-lg" onClick={deal} disabled={!canDeal}>
            🎴 Tahtayı dağıt
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
    if (iGiveClue) {
      return { phase: 'Senin sıran · spymaster', instruction: 'Tek kelime ipucu ve sayı ver.', waiting: false }
    }
    if (myTurn) {
      return {
        phase: 'Senin sıran · operatör',
        instruction: `“${game.clue_word}” ${unlimited ? '(sınırsız)' : game.clue_count} — bir kelimeye bas.`,
        waiting: false,
      }
    }
    if (amSpymaster && me?.team === game.turn) {
      return { phase: 'Takımın tahmin ediyor', instruction: 'Sessiz kal — ipucu verdin.', waiting: true }
    }
    if (!game.clue_word) {
      return {
        phase: `${game.turn === 'red' ? '🔴 Kırmızı' : '🔵 Mavi'} sırası`,
        instruction: 'Spymaster ipucu düşünüyor…',
        waiting: true,
      }
    }
    return {
      phase: `${game.turn === 'red' ? '🔴 Kırmızı' : '🔵 Mavi'} tahmin ediyor`,
      instruction: `“${game.clue_word}” ${unlimited ? '(sınırsız)' : game.clue_count}`,
      waiting: true,
    }
  })()

  return (
    <div className="w-full max-w-3xl flex flex-col gap-3">
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
              className="btn-ghost text-xs shrink-0"
              onClick={() => setAsOperative((v) => !v)}
              title="Takımının ne gördüğünü kontrol et"
            >
              {asOperative ? '🕵️ Anahtarı göster' : '👁 Takım görünümü'}
            </button>
          ) : null
        }
      />

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
      )}

      {/* kalan kartlar + sıra, gerçek uygulamada olduğu gibi tahtanın üstünde */}
      <section className="flex items-stretch gap-2">
        {(['red', 'blue'] as const).map((team) => (
          <div
            key={team}
            className={[
              'flex-1 rounded-2xl border-2 px-4 py-2 flex items-center justify-between',
              team === game.turn && game.phase === 'playing'
                ? team === 'red'
                  ? 'bg-coral text-white border-coral-deep'
                  : 'bg-sky text-white border-sky'
                : 'bg-card border-line',
            ].join(' ')}
          >
            <span className="font-bold text-sm">
              {team === 'red' ? '🔴 Kırmızı' : '🔵 Mavi'}
              {team === game.turn && game.phase === 'playing' && ' · sıra'}
            </span>
            <span className={presenter ? 'text-4xl font-extrabold tabular-nums' : 'text-2xl font-extrabold tabular-nums'}>
              {leftFor(team)}
            </span>
          </div>
        ))}
      </section>

      {/* 5x5 tahta */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {cards.map((c) => {
          const role = keyOf(c.id)
          const showRole = c.revealed || (seeingKey && role)
          const meta = role ? ROLE_MARK[role] : null
          const canGuess = myTurn && !c.revealed && !presenter
          return (
            <button
              key={c.id}
              className={[
                'relative aspect-4/3 rounded-xl border-2 font-bold uppercase tracking-tight transition',
                'flex items-center justify-center text-center px-0.5',
                presenter ? 'text-lg' : 'text-[11px] sm:text-sm',
                showRole && meta ? meta.cls : 'bg-card border-line',
                c.revealed ? 'opacity-80' : '',
                canGuess ? 'hover:scale-105 hover:shadow-md cursor-pointer' : 'cursor-default',
              ].join(' ')}
              onClick={() => canGuess && guessCard(c.id)}
              disabled={!canGuess}
              title={showRole && meta ? `${c.word} — ${meta.label}` : c.word}
            >
              <span className="leading-tight break-all">{c.word}</span>
              {/* renk körlüğü için: rol ayrıca simgeyle işaretli */}
              {showRole && meta && (
                <span
                  className="absolute top-0.5 right-1 text-[10px] leading-none opacity-90"
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
      {game.phase === 'playing' && !presenter && (
        <section className="card flex flex-col gap-3">
          {iGiveClue ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  className="input-blob flex-1 min-w-40"
                  value={clue.word}
                  onChange={(e) => setClue((c) => ({ ...c, word: e.target.value }))}
                  placeholder="Tek kelime ipucu"
                  maxLength={40}
                  onKeyDown={(e) => e.key === 'Enter' && giveClue()}
                />
                <select
                  className="input-blob w-32"
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
                <button className="btn-coral" onClick={giveClue} disabled={!clue.word.trim()}>
                  Ver
                </button>
              </div>
              <p className="text-xs font-semibold text-ink-soft">
                Kural: tek kelime, tahtadaki kelimelerden biri olamaz. Takımın {clue.count > 0 ? clue.count + 1 : '∞'} tahmin
                hakkı kazanır.
              </p>
            </div>
          ) : myTurn ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-ink-soft text-sm">
                {game.guesses_made === 0
                  ? 'Kural: pas geçmeden önce en az bir tahmin yapmalısın.'
                  : `${unlimited ? 'Sınırsız' : game.guesses_left} tahmin hakkın kaldı.`}
              </span>
              <button
                className="btn-ghost text-sm"
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

      {game.phase === 'done' && isHost && !presenter && (
        <div className="flex gap-2 justify-center flex-wrap">
          <button className="btn-coral" onClick={award}>
            🏅 Kazanan takıma puan ver
          </button>
          <button className="btn-ghost" onClick={newGame}>
            Yeni oyun
          </button>
        </div>
      )}

      {seeingKey && !presenter && (
        <p className="text-xs font-semibold text-grape text-center">
          🕵️ Anahtarı görüyorsun. Takımının ne gördüğünü kontrol etmek için “Takım görünümü”ne bas.
        </p>
      )}
    </div>
  )
}
