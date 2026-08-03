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
 * Her durağın tepesindeki "şu an ne oluyor" şeridi.
 *
 * Jackbox'ın çalışan tarafı, oyuncuya sürekli bir sunucunun konuştuğu hissini
 * vermek: hiçbir ekran "burada ne yapmam gerekiyor?" sorusunu bırakmıyor.
 * Uygulamanın en zayıf yeri buydu — duraklar durum gösteriyordu ama ne
 * yapılacağını söylemiyordu. Bu şerit her durağa aynı cevabı verir.
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
    <div
      className={[
        // A raised surface with a 3px accent rail on the leading edge. It used
        // to be a filled, 2px-outlined wash of the stage colour, which made the
        // instruction the loudest object on the screen — louder than the
        // content it was describing.
        'w-full card relative overflow-hidden pl-5',
        presenter ? 'py-4' : 'py-3',
      ].join(' ')}
    >
      {!waiting && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] [background:var(--stage-accent)]"
        />
      )}
      <div className="flex-1 min-w-0">
        <div
          className={[
            'font-bold uppercase tracking-widest text-ink-soft',
            presenter ? 'text-sm' : 'text-[11px]',
          ].join(' ')}
        >
          {phase}
        </div>
        <div
          className={[
            'font-semibold leading-snug text-ink',
            presenter ? 'text-3xl' : 'text-lg',
          ].join(' ')}
        >
          {instruction}
        </div>
      </div>
      {progress && (
        <span
          className={[
            'shrink-0 rounded-[--radius-control] font-medium tabular-nums text-ink-soft',
            'shadow-[inset_0_0_0_1px_var(--color-line)]',
            presenter ? 'px-4 py-2 text-xl' : 'px-2.5 py-1 text-xs',
          ].join(' ')}
        >
          {progress}
        </span>
      )}
      {aside}

      {/* A bar under the band, filled to done/total. The pill alone is 14px at
          the far right of a 1600px screen; this reads from across a call and
          turns "is everyone finished?" into something you glance at. */}
      {ratio != null && (
        <div className="basis-full h-[3px] rounded-full overflow-hidden [background:var(--color-line)]">
          <div
            className="h-full rounded-full transition-[width] duration-500 [background:var(--stage-accent)]"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
