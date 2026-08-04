import type { ReactNode } from 'react'

/**
 * What a stop looks like before it has anything in it.
 *
 * Measured across fifteen stage kinds at 1600x1000: the waiting and unconfigured
 * states used between 6% and 10% of the screen — a sentence of grey text pinned
 * near the top of an otherwise black page. That is most of what "the screens
 * feel empty" actually meant, because it is the state the room sits in every
 * time the host opens a stop before setting it up.
 *
 * An empty state has three jobs and this does all three in the middle of the
 * screen, where the eye already is: say what this stop is, say what happens
 * next, and — if you are the one who can start it — offer that.
 */
export default function StageEmpty({
  icon,
  title,
  body,
  action,
  hint,
}: {
  /** the stage's own mark, muted; identity without shouting */
  icon?: string
  title: string
  /** one sentence, in the second person, about what happens next */
  body?: string
  /** the thing that resolves this state, when the viewer can do it */
  action?: ReactNode
  /** a quieter line under the action — a keyboard hint, a caveat */
  hint?: string
}) {
  return (
    <div className="m-auto w-full max-w-md text-center py-12">
      {icon && (
        <div className="text-5xl opacity-25 mb-5" aria-hidden>
          {icon}
        </div>
      )}
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {body && <p className="text-ink-soft text-sm mt-2 leading-relaxed">{body}</p>}
      {action && <div className="mt-6 flex items-center justify-center gap-2">{action}</div>}
      {hint && <p className="text-xs text-ink-faint mt-4">{hint}</p>}
    </div>
  )
}
