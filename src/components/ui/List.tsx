import type { ReactNode } from 'react'

/**
 * The grouped inset list.
 *
 * The most useful layout primitive there is for anything that is a SET of
 * things: an agenda, a roster, settings, a question bank. Rows share one
 * surface; separators are inset to where the text begins rather than running
 * edge to edge — the detail that makes a list read as one built object instead
 * of a stack of divs.
 *
 * Why it matters here: the console, the passenger list, the rules and the
 * question banks were each a hand-rolled column of bordered cards with
 * different padding, different gaps and different hover behaviour. Four
 * implementations of one idea, none of them alike. This is the one.
 */
export function List({
  title,
  footer,
  action,
  children,
  className = '',
}: {
  /** the uppercase header above the group; sentence-case content goes inside */
  title?: string
  /** an explanatory line under the group — where caveats belong */
  footer?: ReactNode
  /** a control opposite the title, e.g. "Add" */
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 px-1 pb-2">
          {title && (
            <h2 className="eyebrow text-label-3">{title}</h2>
          )}
          {action}
        </div>
      )}
      <div className="list-group">{children}</div>
      {footer && <p className="text-footnote text-label-3 px-1 pt-2 leading-relaxed">{footer}</p>}
    </section>
  )
}

export interface RowProps {
  /** the row's main line */
  title: ReactNode
  /** a quieter second line */
  subtitle?: ReactNode
  /** an icon, avatar or index before the text */
  leading?: ReactNode
  /** a value, badge or control after the text */
  trailing?: ReactNode
  /** makes the row a button; adds hover, press and a pointer */
  onClick?: () => void
  /** the chevron that says "this opens something" */
  chevron?: boolean
  selected?: boolean
  disabled?: boolean
  className?: string
}

/**
 * One row. Four slots, and everything in the app that is a row uses them, so
 * a passenger, an agenda stop and a setting line up down to the pixel.
 */
export function Row({
  title,
  subtitle,
  leading,
  trailing,
  onClick,
  chevron,
  selected,
  disabled,
  className = '',
}: RowProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      aria-current={selected || undefined}
      className={[
        onClick ? 'list-row-tappable' : 'list-row',
        leading ? 'list-row-inset' : '',
        selected ? 'list-row-selected' : '',
        disabled ? 'opacity-40 pointer-events-none' : '',
        className,
      ].join(' ')}
    >
      {leading && (
        <span className="shrink-0 size-8 grid place-items-center" aria-hidden={typeof leading === 'string'}>
          {leading}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-headline truncate">{title}</span>
        {subtitle && (
          <span className="block text-footnote text-label-2 truncate mt-0.5">{subtitle}</span>
        )}
      </span>
      {trailing && <span className="shrink-0 text-subhead text-label-2">{trailing}</span>}
      {chevron && (
        <svg
          className="shrink-0 size-4 text-label-3"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path
            d="M6 3.5L10.5 8L6 12.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </Tag>
  )
}
