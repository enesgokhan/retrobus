import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A popover menu — the overflow for things that must be reachable but do not
 * deserve permanent space in the bar.
 *
 * The navigation previously laid eight text links plus a logout in one strip.
 * At 1400px that is a wall of equal-weight words with no way to tell the three
 * you use constantly from the five you touch once an evening; on a phone it
 * wrapped onto the title. Three items stay in the bar, the rest live here.
 */
export default function Menu({
  trigger,
  label,
  children,
  align = 'end',
}: {
  trigger: ReactNode
  /** accessible name for the trigger */
  label: string
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  /** not `trigger` — that is already the prop holding the trigger's content */
  const triggerEl = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        // Escape dropped focus on <body>, so a keyboard user closing the menu
        // landed nowhere and had to tab from the top of the document.
        triggerEl.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrap} className="relative">
      <button
        ref={triggerEl}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        // 44px, not 36: this is the ONLY way to reach five destinations and the
        // logout on a phone, so it is the last control that should be fiddly.
        // It sits comfortably inside the 56px bar on desktop too.
        className="min-h-11 px-2 rounded-sm inline-flex items-center gap-1.5 text-footnote
          text-label-2 hover:text-label hover:bg-fill-3 transition-colors"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 min-w-52 z-40 p-1 rounded-md material-raised
            shadow-3 animate-pop origin-top-right"
          style={align === 'start' ? { left: 0, right: 'auto' } : undefined}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** One line in a menu. `tone="danger"` for the one that ends something. */
export function MenuItem({
  children,
  onClick,
  tone,
  trailing,
}: {
  children: ReactNode
  onClick?: () => void
  tone?: 'danger'
  trailing?: ReactNode
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={[
        'w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-sm text-subhead',
        'transition-colors hover:bg-fill-2',
        tone === 'danger' ? 'text-bad' : 'text-label',
      ].join(' ')}
    >
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {trailing && <span className="text-footnote text-label-3">{trailing}</span>}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-sep-soft" role="separator" />
}
