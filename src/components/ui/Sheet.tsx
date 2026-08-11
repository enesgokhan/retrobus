import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A sheet — the app's one way of putting something in front of everything else.
 *
 * Adding a stop, configuring a game and editing a question bank were each an
 * inline panel that pushed the page around, so the console grew to 2300px and
 * the thing you opened appeared below the fold you were already looking at.
 * A sheet keeps the context behind it visible and returns you to exactly where
 * you were.
 *
 * The behaviour that makes it feel native rather than like a div with a
 * z-index: Escape closes, the backdrop closes, focus moves in on open and back
 * to the opener on close, and the page behind cannot scroll while it is up.
 */
export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  /** pinned to the bottom, outside the scroll area — where confirm/cancel live */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)
  /** always the newest onClose, without making it an effect dependency */
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKey)

    // focus the first thing worth focusing, not the panel itself
    const first = panel.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not([data-sheet-close])',
    )
    first?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      ;(opener.current as HTMLElement | null)?.focus?.()
    }
    // `onClose` is deliberately NOT a dependency. Both callers pass a fresh
    // inline arrow, so including it re-ran this effect on every parent render —
    // and the console re-renders on a 20s polling cadence, which meant an open
    // sheet blurred its focused field and re-focused its first control while
    // you were typing in it. The latest handler is read through a ref instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-black/60 animate-fade"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          'relative w-full flex flex-col animate-sheet',
          'max-h-[92dvh] sm:max-h-[85dvh]',
          'rounded-t-[20px] sm:rounded-[20px]',
          'bg-bg-3 shadow-3',
          width,
        ].join(' ')}
      >
        {/* the grabber: says "this is a layer that can go away" before you
            have to discover it */}
        <div className="sm:hidden pt-2 pb-1 grid place-items-center shrink-0" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-label-4" />
        </div>

        <header className="flex items-start gap-3 px-5 pt-4 pb-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-title-3">{title}</h2>
            {subtitle && <p className="text-subhead text-label-2 mt-0.5">{subtitle}</p>}
          </div>
          <button
            data-sheet-close
            onClick={onClose}
            aria-label="Kapat"
            className="shrink-0 size-8 grid place-items-center rounded-full bg-fill-2 text-label-2
              hover:bg-fill hover:text-label transition-colors"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
              <path
                d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {footer && (
          <footer className="shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-sep">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
