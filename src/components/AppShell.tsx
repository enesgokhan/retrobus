import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { S } from '../lib/strings'
import HostNav from './HostNav'
import ConnStatus from './ConnStatus'

/**
 * The frame every signed-in screen sits in.
 *
 * Five screens — Kurallar, Profil, Tanı, Yıllık, Yolcular — each built their own
 * header, each at a different width, and each replaced the navigation with a
 * bare "← Geri". So the chrome vanished exactly when you left the two main
 * screens, and getting anywhere meant going back first. Three of them also
 * re-implemented the same title row slightly differently.
 *
 * One shell, one header, one set of widths. A screen supplies its title and its
 * body; everything around it is decided here.
 *
 * Deliberately NOT used by two routes: the presenter view (/sunum), which is
 * projected to the room and must carry no navigation at all, and the login,
 * which has no session to navigate with.
 */
export type ShellWidth = 'narrow' | 'reading' | 'wide' | 'full'

const WIDTH: Record<ShellWidth, string> = {
  narrow: 'max-w-lg', // a single column of controls — profile, join
  reading: 'max-w-3xl', // prose and lists — rules, the yearbook
  wide: 'max-w-6xl', // grids and boards
  full: 'max-w-[1400px]', // the console, which is a two-column instrument panel
}

export interface AppShellProps {
  children: ReactNode
  /** page title, rendered once, in the same place, at the same size */
  title?: string
  /** a quiet line under the title — the meeting name, a count, a date */
  subtitle?: string
  /** controls that belong to this page, placed opposite the title */
  actions?: ReactNode
  width?: ShellWidth
  /**
   * Extra identity shown in the top bar. The room adds who is present; nothing
   * else needs to.
   */
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

  return (
    <div className="min-h-dvh flex flex-col" style={style}>
      <div className="print:hidden">
        <ConnStatus />
      </div>

      <header
        className="sticky top-0 z-30 flex items-center justify-between gap-4 px-5 h-14
          border-b border-[--color-line] bg-[--color-bg]/85 backdrop-blur-md print:hidden"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold tracking-tight shrink-0">{S.appName}</span>
          {member && (
            <>
              <span className="h-4 w-px bg-[--color-line] shrink-0" aria-hidden />
              <span className="text-sm text-ink-soft truncate flex items-center gap-1.5">
                <span aria-hidden>{member.avatar || '🙂'}</span>
                {member.display_name}
              </span>
            </>
          )}
          {headerAside}
        </div>
        <HostNav />
      </header>

      <main className={['flex-1 w-full mx-auto px-5', WIDTH[width], bare ? '' : 'py-8'].join(' ')}>
        {(title || actions) && (
          <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div className="min-w-0">
              {title && <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>}
              {subtitle && <p className="text-sm text-ink-soft mt-0.5">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
