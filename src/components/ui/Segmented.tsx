/**
 * A segmented control — pick one of a few, all visible at once.
 *
 * Used where the app previously used either a row of chips (which look
 * multi-select and are not) or a native <select> (which hides every option but
 * one, and which the audit time-range picker had already proven to be the
 * wrong control for a small fixed set).
 *
 * Keep it to 2–5 options. Beyond that it is a list, not a segment.
 */
export default function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className = '',
  'aria-label': ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: string }[]
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={['segmented', className].join(' ')}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={[
              on ? 'segmented-item-on' : 'segmented-item',
              size === 'sm' ? 'min-h-[26px] px-2.5 text-caption' : '',
            ].join(' ')}
          >
            {o.icon && <span aria-hidden>{o.icon}</span>}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
