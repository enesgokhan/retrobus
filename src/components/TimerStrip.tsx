import { useEffect, useState } from 'react'
import type { Stage } from '../lib/types'

function remainingSeconds(stage: Stage): number | null {
  if (stage.timer_ends_at) {
    return Math.max(0, Math.round((new Date(stage.timer_ends_at).getTime() - Date.now()) / 1000))
  }
  if (stage.timer_remaining_s != null) return stage.timer_remaining_s // paused
  return null
}

/**
 * The shared countdown — the host starts and pauses it, everyone renders the
 * same clock.
 *
 * Tabular figures are not a nicety here: without them the minute digit changes
 * width every second and the whole pill visibly twitches for three minutes.
 * The urgent state is the one place in the app that uses the alarm colour, and
 * it stops pulsing at zero rather than flashing forever at a room that has
 * already moved on.
 */
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
  const done = left === 0
  const urgent = !paused && !done && left <= 30

  return (
    <div
      className={[
        'inline-flex items-center gap-2 rounded-full nums font-semibold',
        big ? 'px-5 py-2.5 text-title-1' : 'px-3.5 py-1.5 text-callout',
        done
          ? 'bg-fill-3 text-label-3'
          : urgent
            ? 'bg-[color-mix(in_srgb,var(--color-bad)_18%,transparent)] text-bad'
            : 'bg-fill-2 text-label',
        paused ? 'opacity-60' : '',
      ].join(' ')}
      aria-label={paused ? 'Süre duraklatıldı' : 'Kalan süre'}
    >
      <span aria-hidden className={big ? 'text-3xl' : 'text-subhead'}>
        {paused ? '⏸' : '⏱'}
      </span>
      {m}:{s.toString().padStart(2, '0')}
    </div>
  )
}
