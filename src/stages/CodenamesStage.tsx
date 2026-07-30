import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import { drawBoard } from '../content/tr/codenames'
import { fireConfetti, playConfirm, playReveal } from '../lib/celebrate'
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
interface Key {
  card_id: string
  role: 'red' | 'blue' | 'neutral' | 'assassin'
}

const ROLE_STYLE: Record<string, string> = {
  red: 'bg-coral text-white border-coral-deep',
  blue: 'bg-sky text-white border-sky',
  neutral: 'bg-amber-soft text-ink border-amber',
  assassin: 'bg-ink text-white border-ink',
}

/**
 * Kelime Ajanları (Codenames TR).
 *
 * Anahtar kart ASLA operatörün tarayıcısına gitmez: `cn_keys` üzerindeki RLS
 * politikası onu yalnızca o oyunun spymaster'larına (ve açılmış kartlar için
 * herkese) verir. İstemcide filtreleme yok — devtools açan biri hiçbir şey
 * göremez, çünkü veri hiç gelmez.
 */
export default function CodenamesStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [keys, setKeys] = useState<Key[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [clue, setClue] = useState({ word: '', count: 1 })
  const [error, setError] = useState<string | null>(null)
  const [lastWinner, setLastWinner] = useState<string | null>(null)

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      const { data: g } = await supabase
        .from('cn_games')
        .select('id, phase, turn, starting_team, winner, win_reason, clue_word, clue_count, guesses_left')
        .eq('stage_id', stage.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      setGame((g as Game) ?? null)
      if (!g) {
        setPlayers([])
        setCards([])
        setKeys([])
        return
      }
      const [{ data: p }, { data: c }, { data: k }, { data: m }] = await Promise.all([
        supabase.from('cn_players').select('*').eq('game_id', (g as Game).id),
        supabase.from('cn_cards').select('id, word, position, revealed').eq('game_id', (g as Game).id).order('position'),
        // RLS decides what comes back here — spymasters get all 25, everyone
        // else gets only the flipped ones.
        supabase.from('cn_keys').select('card_id, role').eq('game_id', (g as Game).id),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
      ])
      if (cancelled) return
      setPlayers((p as Player[]) ?? [])
      setCards((c as Card[]) ?? [])
      setKeys((k as Key[]) ?? [])
      setMembers((m as Member[]) ?? [])
    }
    load()
    const channel = liveChannel(`cn-${stage.id}`, ['cn_games', 'cn_players', 'cn_cards'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  // celebrate exactly once per finished game
  useEffect(() => {
    if (game?.phase === 'done' && game.winner && lastWinner !== game.id) {
      setLastWinner(game.id)
      playReveal()
      fireConfetti()
    }
  }, [game?.phase, game?.winner, game?.id, lastWinner])

  const me = players.find((p) => p.member_id === member?.id) ?? null
  const amSpymaster = me?.is_spymaster ?? false
  const keyOf = (cardId: string) => keys.find((k) => k.card_id === cardId)?.role ?? null
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—'

  const remaining = (team: 'red' | 'blue') =>
    keys.filter((k) => k.role === team && !cards.find((c) => c.id === k.card_id)?.revealed).length

  // spymasters can count exactly; everyone else infers from the board
  const totalFor = (team: 'red' | 'blue') => (game?.starting_team === team ? 9 : 8)
  const flippedFor = (team: 'red' | 'blue') =>
    cards.filter((c) => c.revealed && keyOf(c.id) === team).length

  async function newGame() {
    const { error: e } = await supabase.from('cn_games').insert({ stage_id: stage.id })
    if (e) setError('Oyun kurulamadı.')
  }
  async function join(team: 'red' | 'blue', spymaster: boolean) {
    setError(null)
    const { error: e } = await supabase.rpc('cn_join', {
      p_game_id: game!.id,
      p_team: team,
      p_spymaster: spymaster,
    })
    if (e) {
      setError(
        e.message.includes('spymaster')
          ? 'O takımın spymaster’ı var.'
          : e.message.includes('started')
            ? 'Oyun başladı.'
            : 'Katılınamadı.',
      )
    } else {
      playConfirm()
    }
  }
  async function deal() {
    setError(null)
    const { error: e } = await supabase.rpc('cn_deal', {
      p_game_id: game!.id,
      p_words: drawBoard(25),
    })
    if (e) {
      setError(
        e.message.includes('spymaster')
          ? 'Her iki takımın da spymaster’ı olmalı.'
          : 'Dağıtılamadı.',
      )
    }
  }
  async function giveClue() {
    if (!clue.word.trim()) return
    setError(null)
    const { error: e } = await supabase.rpc('cn_clue', {
      p_game_id: game!.id,
      p_word: clue.word,
      p_count: clue.count,
    })
    if (e) setError(e.message.includes('turn') ? 'Sıra sizde değil.' : 'İpucu verilemedi.')
    else setClue({ word: '', count: 1 })
  }
  async function guessCard(cardId: string) {
    setError(null)
    const { data, error: e } = await supabase.rpc('cn_guess', { p_card_id: cardId })
    if (e) {
      setError(
        e.message.includes('turn')
          ? 'Sıra sizde değil.'
          : e.message.includes('clue')
            ? 'İpucu bekleniyor.'
            : e.message.includes('spymaster')
              ? 'Spymaster tahmin etmez.'
              : 'Seçilemedi.',
      )
      return
    }
    const res = data as { role: string; ended: boolean }
    if (res.role === 'assassin') playReveal()
    else playConfirm()
  }
  async function pass() {
    await supabase.rpc('cn_pass', { p_game_id: game!.id })
  }
  async function award() {
    const { error: e } = await supabase.rpc('cn_award', { p_game_id: game!.id })
    if (e) setError('Puanlanamadı.')
    else setError(null)
  }

  if (!game) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-ink-soft">{isHost ? 'Oyun yok.' : 'Şoför oyunu kuruyor…'}</p>
        {isHost && !presenter && (
          <button className="btn-coral" onClick={newGame}>
            Yeni oyun kur
          </button>
        )}
      </div>
    )
  }

  // ---------- lobby ----------
  if (game.phase === 'lobby') {
    return (
      <div className="w-full max-w-2xl flex flex-col gap-4">
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
                className={[
                  'card flex flex-col gap-2 border-2',
                  team === 'red' ? 'border-coral' : 'border-sky',
                ].join(' ')}
              >
                <h3 className={['font-extrabold', team === 'red' ? 'text-coral' : 'text-sky'].join(' ')}>
                  {team === 'red' ? '🔴 Kırmızı' : '🔵 Mavi'} ({roster.length})
                </h3>
                <ul className="text-sm flex flex-col gap-1 min-h-16">
                  {roster.map((p) => (
                    <li key={p.member_id} className="font-semibold">
                      {p.is_spymaster ? '🕵️ ' : '👤 '}
                      {nameOf(p.member_id)}
                    </li>
                  ))}
                  {!roster.length && <li className="text-ink-soft">boş</li>}
                </ul>
                {!presenter && (
                  <div className="flex gap-2">
                    <button className="btn-ghost text-xs flex-1" onClick={() => join(team, false)}>
                      Operatör ol
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
          Takımını ve rolünü kendin seç. Her takımda tam bir spymaster olmalı.
        </p>
        {isHost && !presenter && (
          <button className="btn-coral self-center" onClick={deal}>
            🎴 Tahtayı dağıt ve başla
          </button>
        )}
      </div>
    )
  }

  // ---------- board ----------
  const myTurn = me && !me.is_spymaster && me.team === game.turn && game.clue_word
  const iGiveClue = amSpymaster && me?.team === game.turn && !game.clue_word

  return (
    <div className="w-full max-w-3xl flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
      )}

      {/* durum şeridi */}
      <section className="card flex items-center justify-between gap-3 flex-wrap py-3">
        <div className="flex items-center gap-4 font-extrabold">
          <span className="text-coral">
            🔴 {amSpymaster ? remaining('red') : totalFor('red') - flippedFor('red')}
          </span>
          <span className="text-sky">
            🔵 {amSpymaster ? remaining('blue') : totalFor('blue') - flippedFor('blue')}
          </span>
        </div>
        {game.phase === 'done' ? (
          <span className="font-extrabold">
            🏆 {game.winner === 'red' ? 'Kırmızı' : 'Mavi'} kazandı
            {game.win_reason === 'assassin' ? ' (suikastçı!)' : ''}
          </span>
        ) : (
          <span className="font-bold">
            Sıra: {game.turn === 'red' ? '🔴 Kırmızı' : '🔵 Mavi'}
            {game.clue_word && (
              <>
                {' · '}
                <span className="text-coral">
                  {game.clue_word} {game.clue_count}
                </span>
                {' · '}
                {game.guesses_left} tahmin
              </>
            )}
          </span>
        )}
        {amSpymaster && <span className="text-xs font-bold text-grape">🕵️ anahtarı görüyorsun</span>}
      </section>

      {/* 5x5 tahta */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {cards.map((c) => {
          const role = keyOf(c.id)
          const canGuess = !!myTurn && !c.revealed && !presenter
          // spymasters see roles as a tint; operatives only see flipped cards
          const showRole = c.revealed || (amSpymaster && role)
          return (
            <button
              key={c.id}
              className={[
                'aspect-4/3 rounded-xl border-2 font-bold uppercase tracking-tight transition',
                presenter ? 'text-lg' : 'text-[11px] sm:text-sm',
                showRole && role ? ROLE_STYLE[role] : 'bg-card border-line',
                c.revealed ? 'opacity-70' : '',
                amSpymaster && !c.revealed && role ? 'ring-2 ring-inset ring-black/10' : '',
                canGuess ? 'hover:scale-105 cursor-pointer' : 'cursor-default',
              ].join(' ')}
              onClick={() => canGuess && guessCard(c.id)}
              disabled={!canGuess}
              title={c.word}
            >
              <span className="px-0.5 break-all leading-tight">{c.word}</span>
            </button>
          )
        })}
      </div>

      {/* eylemler */}
      {game.phase === 'playing' && !presenter && (
        <section className="card flex flex-col gap-3">
          {iGiveClue ? (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                className="input-blob flex-1 min-w-40"
                value={clue.word}
                onChange={(e) => setClue((c) => ({ ...c, word: e.target.value }))}
                placeholder="Tek kelime ipucu"
                maxLength={40}
              />
              <input
                type="number"
                className="input-blob w-20 text-center"
                min={0}
                max={9}
                value={clue.count}
                onChange={(e) =>
                  setClue((c) => ({ ...c, count: Math.max(0, Math.min(9, Number(e.target.value) || 0)) }))
                }
              />
              <button className="btn-coral" onClick={giveClue} disabled={!clue.word.trim()}>
                İpucu ver
              </button>
            </div>
          ) : myTurn ? (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-ink-soft text-sm">
                Bir kelimeye bas. {game.guesses_left} tahmin hakkın var.
              </span>
              <button className="btn-ghost text-sm" onClick={pass}>
                Pas geç
              </button>
            </div>
          ) : (
            <p className="text-sm font-semibold text-ink-soft">
              {amSpymaster
                ? 'Diğer takımın sırası — bekle.'
                : game.clue_word
                  ? 'Diğer takım tahmin ediyor.'
                  : 'Spymaster ipucu düşünüyor…'}
            </p>
          )}
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
    </div>
  )
}
