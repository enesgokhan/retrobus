import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { S } from '../lib/strings'
import HostNav from './HostNav'
import ConnStatus from './ConnStatus'

/**
 * The frame every signed-in screen sits in.
 *
 * Two things it fixes.
 *
 * First, chrome that vanished: five screens each built their own header at
 * their own width and replaced the navigation with a bare "← Geri", so getting
 * anywhere meant going back first. One shell, one header, one set of widths.
 *
 * Second, the title. A page title lives in ONE place at ONE size, and it does
 * the iOS thing — large and in the content column at rest, collapsing into the
 * bar as you scroll past it. That is not decoration: it means the title is
 * generous when you arrive and still present when you are deep in a long
 * screen, which is exactly the "top bar shouldn't disappear" complaint.
 *
 * Deliberately NOT used by two routes: the presenter view (/sunum), projected
 * to the room and carrying no navigation at all, and the login, which has no
 * session to navigate with.
 */
export type ShellWidth = 'narrow' | 'reading' | 'wide' | 'full'

const WIDTH: Record<ShellWidth, string> = {
  narrow: 'max-w-md', // one column of controls — profile, join
  reading: 'max-w-2xl', // prose and lists; ~70 characters at 17px
  wide: 'max-w-5xl', // grids and boards
  full: 'max-w-[1500px]', // the console, which is an instrument panel
}

export interface AppShellProps {
  children: ReactNode
  /** page title, rendered once, in the same place, at the same size */
  title?: string
  /** a quiet line under the title — the meeting name, a count, a date */
  subtitle?: ReactNode
  /** controls that belong to this page, placed opposite the title */
  actions?: ReactNode
  width?: ShellWidth
  /** extra identity in the top bar; the room adds who is present */
  headerAside?: ReactNode
  /** the room paints its own stage world behind everything */
  style?: React.CSSProperties
  /** stage screens manage their own vertical rhythm */
  bare?: boolean
}

export default function AppShell({
  children,
  title,
  subtitle,
  actions,
  width = 'reading',
  headerAside,
  style,
  bare = false,
}: AppShellProps) {
  const { member } = useAuth()
  const sentinel = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  // The large title hands its job to the bar when it scrolls out of view.
  // An observer rather than a scroll listener: no work on frames where
  // nothing crossed the line.
  useEffect(() => {
    const el = sentinel.current
    if (!el || !title) return
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [title])

  return (
    <div className="min-h-dvh flex flex-col" style={style}>
      <div className="print:hidden">
        <ConnStatus />
      </div>

      <header className="sticky top-0 z-30 material border-b border-sep print:hidden">
        <div
          className={['mx-auto w-full px-5 h-14 flex items-center gap-4', WIDTH[width]].join(' ')}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="text-headline shrink-0">{S.appName}</span>

            {/* The collapsed title takes over the bar as the large one leaves.
                Both are never visible at once. */}
            {title && (
              <span
                className={[
                  'hidden sm:flex items-center gap-2.5 min-w-0 transition-[opacity,transform] duration-200',
                  collapsed ? 'opacity-100' : 'opacity-0 -translate-y-1 pointer-events-none',
                ].join(' ')}
                aria-hidden={!collapsed}
              >
                <span className="h-3.5 w-px bg-sep shrink-0" />
                <span className="text-subhead text-label-2 truncate">{title}</span>
              </span>
            )}

            {member && !collapsed && (
              <span className="hidden sm:flex items-center gap-2 min-w-0 text-footnote text-label-2">
                <span className="h-3.5 w-px bg-sep shrink-0" aria-hidden />
                <span aria-hidden>{member.avatar || '🙂'}</span>
                <span className="truncate">{member.display_name}</span>
              </span>
            )}
            {headerAside}
          </div>
          <HostNav />
        </div>
      </header>

      <main
        className={['flex-1 w-full mx-auto px-5', WIDTH[width], bare ? 'flex flex-col' : 'pb-16'].join(
          ' ',
        )}
      >
        {(title || actions) && (
          <>
            <div className="flex items-end justify-between gap-4 flex-wrap pt-8 pb-6">
              <div className="min-w-0">
                {title && <h1 className="text-title-2">{title}</h1>}
                {subtitle && <p className="text-subhead text-label-2 mt-1">{subtitle}</p>}
              </div>
              {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
            </div>
            {/* the line the large title crosses on its way out */}
            <div ref={sentinel} className="h-px -mt-px" aria-hidden />
          </>
        )}
        {children}
      </main>
    </div>
  )
}
