import type { ReactNode } from 'react'

export interface StageHeaderProps {
  /** short phase label, e.g. "Yazma zamanı" */
  phase: string
  /** what THIS person should do right now, in second person */
  instruction: string
  /** optional progress, e.g. "5/9 yazdı" */
  progress?: string | null
  /** true when this person has nothing to do but wait */
  waiting?: boolean
  /** big presenter styling */
  presenter?: boolean
  /** extra controls on the right */
  aside?: ReactNode
}

/**
 * "Şu an ne oluyor" — the status line at the top of every stop.
 *
 * Jackbox's working insight is that a player never has to ask what they are
 * supposed to be doing. This line gives every stop the same answer.
 *
 * It is deliberately NOT a card. It used to be one — a rounded rect on the
 * `bg-1` surface with a hairline — which put it at exactly the same visual
 * weight as the composer below it and the room's actual words below that.
 * Three different kinds of thing, one treatment, and the eye had nowhere to
 * go. Status is chrome: it gets a tint dot, the type ramp and a hairline
 * meter, and it gets no surface of its own.
 */
export default function StageHeader({
  phase,
  instruction,
  progress,
  waiting = false,
  presenter = false,
  aside,
}: StageHeaderProps) {
  // progress arrives as free text like "3/8 yazdı"; pull the fraction out of it
  // rather than changing every call site
  const ratio = (() => {
    const m = /(\d+)\s*\/\s*(\d+)/.exec(progress ?? '')
    if (!m) return null
    const [a, b] = [Number(m[1]), Number(m[2])]
    return b > 0 ? Math.min(1, a / b) : null
  })()

  return (
    <div className="w-full flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Codenames names its phase "🔴 Kırmızı sırası", so the state dot
            landed immediately left of a red circle emoji and the line opened
            with two bullets. If the phase already carries its own mark, that
            IS the dot. */}
        {!/^\p{Extended_Pictographic}/u.test(phase.trim()) && (
          <span
            className={[
              'shrink-0 size-2 rounded-full',
              waiting ? 'bg-label-4' : 'bg-(--tint)',
            ].join(' ')}
            aria-hidden
          />
        )}
        <span
          className={[
            'text-label-3',
            presenter ? 'eyebrow-lg' : 'eyebrow',
          ].join(' ')}
        >
          {phase}
        </span>
        <span className="flex-1" />
        {progress && (
          <span
            className={[
              'shrink-0 nums text-label-2',
              presenter ? 'text-title-3' : 'text-footnote',
            ].join(' ')}
          >
            {progress}
          </span>
        )}
        {aside}
      </div>

      <p
        className={[
          waiting ? 'text-label-2' : 'text-label',
          presenter ? 'text-title-2' : 'text-headline',
        ].join(' ')}
      >
        {instruction}
      </p>

      {/* A meter under the line, filled to done/total. The count alone is 13px
          at the far right of a 1500px screen; this reads from across a call and
          turns "is everyone finished?" into something you glance at. */}
      {ratio != null && (
        <div className="mt-1 h-[3px] w-full rounded-full overflow-hidden bg-fill-3">
          <div
            className="h-full rounded-full bg-(--tint) transition-[width] duration-500"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
