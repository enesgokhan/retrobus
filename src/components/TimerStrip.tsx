import { useEffect, useState } from 'react'
import type { Stage } from '../lib/types'

function remainingSeconds(stage: Stage): number | null {
  if (stage.timer_ends_at) {
    return Math.max(0, Math.round((new Date(stage.timer_ends_at).getTime() - Date.now()) / 1000))
  }
  if (stage.timer_remaining_s != null) return stage.timer_remaining_s // paused
  return null
}

/** Shared countdown — host starts/pauses it, everyone renders the same clock. */
export default function TimerStrip({ stage, big = false }: { stage: Stage; big?: boolean }) {
  const [left, setLeft] = useState<number | null>(() => remainingSeconds(stage))

  useEffect(() => {
    setLeft(remainingSeconds(stage))
    if (!stage.timer_ends_at) return
    const t = setInterval(() => setLeft(remainingSeconds(stage)), 500)
    return () => clearInterval(t)
  }, [stage])

  if (left == null) return null
  const m = Math.floor(left / 60)
  const s = left % 60
  const paused = !stage.timer_ends_at
  const urgent = !paused && left <= 30

  return (
    <div
      className={[
        'inline-flex items-center gap-2 rounded-full font-bold tabular-nums',
        big ? 'px-6 py-3 text-4xl' : 'px-4 py-1.5 text-lg',
        urgent ? 'bg-rose-soft text-coral-deep animate-pulse' : 'bg-amber-soft text-ink',
        paused ? 'opacity-60' : '',
      ].join(' ')}
    >
      <span aria-hidden>{paused ? '⏸' : '⏱'}</span>
      {m}:{s.toString().padStart(2, '0')}
    </div>
  )
}
