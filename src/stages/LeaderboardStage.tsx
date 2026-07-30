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
    if (!revealed) {
      setShown(0)
      return
    }
    // reveal one place at a time, slowest at the top
    let n = 0
    const timer = setInterval(() => {
      n += 1
      setShown(n)
      if (n >= rows.length) {
        clearInterval(timer)
        fireConfetti()
      }
    }, 900)
    return () => clearInterval(timer)
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

  return (
    <div className={['w-full flex flex-col gap-2', presenter ? 'max-w-4xl gap-3' : 'max-w-2xl'].join(' ')}>
      {ordered.map((r, i) => {
        const place = i + 1
        const visible = i >= visibleFromIndex
        const isWinner = place === 1 && shown >= ordered.length
        return (
          <div
            key={r.member_id}
            className={[
              'flex items-center gap-3 rounded-2xl border-2 px-4 transition-all duration-500',
              presenter ? 'py-7' : 'py-3',
              visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
              isWinner ? 'bg-amber-soft border-amber scale-105' : 'bg-card border-line',
            ].join(' ')}
          >
            <span className={presenter ? 'text-6xl w-20' : 'text-2xl w-10'} aria-hidden>
              {PODIUM[i] ?? place}
            </span>
            <span className={presenter ? 'text-6xl' : 'text-2xl'} aria-hidden>
              {r.avatar || '🙂'}
            </span>
            <span className={['flex-1 font-extrabold truncate', presenter ? 'text-5xl' : 'text-lg'].join(' ')}>
              {r.display_name}
            </span>
            <span className={['font-extrabold tabular-nums', presenter ? 'text-6xl' : 'text-xl'].join(' ')}>
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
