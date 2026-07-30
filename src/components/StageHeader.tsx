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
        'w-full rounded-3xl border-2 px-5 flex items-center gap-4 flex-wrap',
        presenter ? 'py-5' : 'py-3.5',
        // Was a hardcoded amber. This strip is the widest, tallest,
        // highest-contrast object on every stage — so painting it amber
        // regardless of stage overrode the whole per-stage colour identity and
        // made teal discussion, grape games and rose feedback all read as "the
        // amber app". accent-wash reads the stage's own variables.
        waiting ? 'bg-bg border-line' : 'accent-wash',
      ].join(' ')}
    >
      <span className={presenter ? 'text-4xl' : 'text-2xl'} aria-hidden>
        {waiting ? '⏳' : '👉'}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className={[
            'font-bold uppercase tracking-widest text-ink-soft',
            presenter ? 'text-sm' : 'text-[11px]',
          ].join(' ')}
        >
          {phase}
        </div>
        <div className={presenter ? 'text-3xl font-extrabold' : 'text-2xl font-extrabold leading-snug'}>
          {instruction}
        </div>
      </div>
      {progress && (
        <span
          className={[
            'shrink-0 rounded-full bg-card border-2 border-line font-bold tabular-nums',
            presenter ? 'px-4 py-2 text-xl' : 'px-3 py-1 text-sm',
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
        <div className="basis-full h-1.5 rounded-full overflow-hidden [background:color-mix(in_srgb,var(--stage-accent)_18%,transparent)]">
          <div
            className="h-full rounded-full transition-[width] duration-500 [background:var(--stage-accent)]"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
