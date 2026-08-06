import type { ReactNode } from 'react'

/**
 * Something went wrong, or something needs saying.
 *
 * Every stage had its own error styling — one used a rose wash with
 * a deep-coral text colour, one used a bare red paragraph, one used the stage
 * accent — which meant an error on a game stop was purple. An error is about
 * the system, not about the game, so it never uses the stage tint.
 */
export default function Alert({
  tone = 'bad',
  children,
  action,
}: {
  tone?: 'bad' | 'warn' | 'info'
  children: ReactNode
  action?: ReactNode
}) {
  const color =
    tone === 'bad' ? 'var(--color-bad)' : tone === 'warn' ? 'var(--color-warn)' : 'var(--color-blue)'
  return (
    <div
      role={tone === 'info' ? undefined : 'alert'}
      className="w-full flex items-center gap-3 rounded-md px-3.5 py-2.5 text-subhead animate-fade"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
      }}
    >
      <span className="flex-1 min-w-0">{children}</span>
      {action}
    </div>
  )
}
