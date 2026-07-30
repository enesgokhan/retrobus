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
  return (
    <div
      className={[
        'w-full rounded-3xl border-2 px-5 flex items-center gap-4 flex-wrap',
        presenter ? 'py-5' : 'py-3.5',
        waiting ? 'bg-bg border-line' : 'bg-amber-soft border-amber',
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
        <div className={presenter ? 'text-3xl font-extrabold' : 'text-lg font-extrabold leading-snug'}>
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
    </div>
  )
}
