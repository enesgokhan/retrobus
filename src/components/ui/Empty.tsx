import type { ReactNode } from 'react'

/**
 * What a screen looks like before it has anything in it.
 *
 * Measured across fifteen stage kinds at 1600×1000, the waiting and
 * unconfigured states used between 6% and 10% of the screen — one sentence of
 * grey text pinned near the top of an otherwise black page. That is most of
 * what "the screens feel empty" actually meant, because it is the state the
 * room sits in every time a stop is opened before it is set up.
 *
 * An empty state has three jobs and this does all three: say what this is, say
 * what happens next, and — if the person looking at it is the one who can
 * resolve it — offer that.
 */
export default function Empty({
  icon,
  title,
  body,
  action,
  hint,
  size = 'md',
}: {
  /** the stop's own mark, muted; identity without shouting */
  icon?: ReactNode
  title: string
  /** one sentence, second person, about what happens next */
  body?: ReactNode
  /** the control that resolves this state, when the viewer can do it */
  action?: ReactNode
  /** a quieter line under the action — a caveat, a keyboard hint */
  hint?: ReactNode
  /** `lg` for a whole stage, `md` inside a panel, `sm` inside a list */
  size?: 'sm' | 'md' | 'lg'
}) {
  const pad = size === 'lg' ? 'py-20' : size === 'sm' ? 'py-8' : 'py-14'
  const mark = size === 'lg' ? 'text-6xl' : size === 'sm' ? 'text-3xl' : 'text-5xl'
  const head = size === 'lg' ? 'text-title-2' : size === 'sm' ? 'text-headline' : 'text-title-3'

  return (
    <div className={['m-auto w-full max-w-sm text-center animate-fade', pad].join(' ')}>
      {icon && (
        <div className={[mark, 'opacity-30 mb-5 leading-none'].join(' ')} aria-hidden>
          {icon}
        </div>
      )}
      <h2 className={head}>{title}</h2>
      {body && <p className="text-subhead text-label-2 mt-2 leading-relaxed text-balance">{body}</p>}
      {action && <div className="mt-6 flex items-center justify-center gap-2">{action}</div>}
      {hint && <p className="text-footnote text-label-3 mt-4">{hint}</p>}
    </div>
  )
}
