import { useEffect, useState } from 'react'
import type { Stage } from '../lib/types'

/**
 * Mola ekranı.
 *
 * Bilinçli olarak neredeyse boş: molanın işi hiçbir şey istememek. Tek iş,
 * geri sayımı büyük ve uzaktan okunabilir göstermek — telefona bakmadan
 * "ne kadar kaldı?" sorusunun cevabı görünsün.
 */
export default function BreakStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    function tick() {
      if (stage.timer_ends_at) {
        setLeft(Math.max(0, Math.round((new Date(stage.timer_ends_at).getTime() - Date.now()) / 1000)))
      } else if (stage.timer_remaining_s != null) {
        setLeft(stage.timer_remaining_s)
      } else {
        setLeft(null)
      }
    }
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [stage.timer_ends_at, stage.timer_remaining_s])

  const over = left === 0
  const planned = typeof stage.config.minutes === 'number' ? stage.config.minutes : null
  const m = left == null ? null : Math.floor(left / 60)
  const s = left == null ? null : left % 60

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center gap-6 py-10 text-center">
      <div className={presenter ? 'text-[9rem] leading-none' : 'text-8xl leading-none'} aria-hidden>
        {over ? '👋' : '☕'}
      </div>

      {left != null ? (
        <div
          className={[
            'nums leading-none text-[--tint]',
            presenter ? 'text-[10rem]' : 'text-7xl',
            over ? 'animate-pulse' : '',
          ].join(' ')}
        >
          {m}:{String(s).padStart(2, '0')}
        </div>
      ) : planned ? (
        // The stage knows how long the break is meant to be, so show it rather
        // than the word "Mola" — which the title above already says. Muted,
        // because it has not started counting yet.
        <div
          className={[
            'font-semibold tabular-nums leading-none text-label-2/50',
            presenter ? 'text-[10rem]' : 'text-7xl',
          ].join(' ')}
        >
          {planned}:00
        </div>
      ) : null}

      <p className={presenter ? 'text-title-1 text-label-2' : 'text-headline text-label-2'}>
        {over
          ? 'Süre doldu — geri dönüyoruz.'
          : left == null && planned
            ? 'Sayaç başlatıldığında geri sayım burada işleyecek.'
            : 'Kahve al, biraz ayağa kalk.'}
      </p>
    </div>
  )
}
