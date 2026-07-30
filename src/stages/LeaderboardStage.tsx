import { useEffect, useState } from 'react'
import { useLeaderboard } from '../lib/useLeaderboard'
import { fireConfetti } from '../lib/celebrate'
import type { Stage } from '../lib/types'

const PODIUM = ['🥇', '🥈', '🥉']

/**
 * Şampiyonluk tablosu.
 * Sıralama toplantı boyunca gizli tutulur; burada aşağıdan yukarıya doğru
 * açılır — gerilim işin bütün amacı.
 */
export default function LeaderboardStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const rows = useLeaderboard(stage.meeting_id)
  const revealed = stage.state === 'revealed' || stage.state === 'closed'
  // how many places are shown, counting up from last
  const [shown, setShown] = useState(0)

  useEffect(() => {
    // Guard on rows too: a presenter tab opened AFTER the host revealed mounts
    // with an empty board, fires confetti into a blank gold page, and then
    // replays the whole reveal when the rows arrive.
    if (!revealed || !rows.length) {
      setShown(0)
      return
    }
    // An accelerando, not a metronome: the last three places get progressively
    // more room, and first place gets a hold before it lands.
    const delayFor = (placesLeft: number) =>
      placesLeft === 1 ? 2600 : placesLeft === 2 ? 1600 : placesLeft === 3 ? 1100 : 550

    let n = 0
    let timer: ReturnType<typeof setTimeout>
    let burst: ReturnType<typeof setTimeout>
    const step = () => {
      n += 1
      setShown(n)
      if (n >= rows.length) {
        // let the room read the name before the screen fills with paper
        burst = setTimeout(fireConfetti, 500)
        return
      }
      timer = setTimeout(step, delayFor(rows.length - n))
    }
    timer = setTimeout(step, delayFor(rows.length))
    return () => {
      clearTimeout(timer)
      clearTimeout(burst)
    }
  }, [revealed, rows.length])

  if (!revealed) {
    return (
      <div className="text-center">
        <div className={presenter ? 'text-9xl mb-4' : 'text-7xl mb-3'} aria-hidden>
          🤫
        </div>
        <p className={presenter ? 'text-3xl font-extrabold' : 'text-xl font-extrabold'}>
          Sıralama gizli
        </p>
        <p className="text-ink-soft mt-1">Şoför açtığında hep birlikte göreceğiz.</p>
      </div>
    )
  }

  // build bottom-up so the winner lands last
  const ordered = [...rows]
  const visibleFromIndex = Math.max(0, ordered.length - shown)
  const champion = ordered[0]
  const championIn = shown >= ordered.length

  return (
    <div className={['w-full flex flex-col gap-3', presenter ? 'max-w-5xl' : 'max-w-4xl'].join(' ')}>
      {/* First place is not fourth place with a 5% scale on it. */}
      {champion && (
        <div
          className={[
            'rounded-3xl border-2 flex flex-col items-center gap-1 transition-all duration-700',
            'bg-amber-soft border-amber shadow-[0_5px_0_0_var(--color-amber)]',
            presenter ? 'py-10' : 'py-7',
            championIn ? 'opacity-100 scale-100' : 'opacity-0 scale-90',
          ].join(' ')}
        >
          <div className={presenter ? 'text-[9rem] leading-none' : 'text-8xl leading-none'} aria-hidden>
            {champion.avatar || '🙂'}
          </div>
          <div className={['font-extrabold', presenter ? 'text-8xl' : 'text-5xl'].join(' ')}>
            {champion.display_name}
          </div>
          <div className={['font-extrabold tabular-nums', presenter ? 'text-9xl' : 'text-6xl'].join(' ')}>
            {champion.points}
          </div>
          <div className="text-sm font-bold uppercase tracking-widest text-ink-soft">🥇 Şampiyon</div>
        </div>
      )}

      {ordered.slice(1).map((r, idx) => {
        const i = idx + 1
        const place = i + 1
        const visible = i >= visibleFromIndex
        return (
          <div
            key={r.member_id}
            className={[
              'flex items-center gap-3 rounded-2xl border-2 px-4 transition-all duration-500',
              presenter ? 'py-6' : 'py-5',
              visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
              'bg-card border-line shadow-[0_3px_0_0_var(--color-line)]',
            ].join(' ')}
          >
            <span className={presenter ? 'text-5xl w-20' : 'text-3xl w-12'} aria-hidden>
              {PODIUM[i] ?? place}
            </span>
            <span className={presenter ? 'text-5xl' : 'text-4xl'} aria-hidden>
              {r.avatar || '🙂'}
            </span>
            <span className={['flex-1 font-extrabold truncate', presenter ? 'text-4xl' : 'text-3xl'].join(' ')}>
              {r.display_name}
            </span>
            <span className={['font-extrabold tabular-nums', presenter ? 'text-5xl' : 'text-4xl'].join(' ')}>
              {r.points}
            </span>
          </div>
        )
      })}
      {shown < ordered.length && (
        <p className="text-center text-ink-soft font-semibold animate-pulse mt-2">açılıyor…</p>
      )}
    </div>
  )
}
