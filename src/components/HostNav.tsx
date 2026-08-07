import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { S } from '../lib/strings'
import Menu, { MenuItem, MenuSeparator } from './ui/Menu'
import { applyTheme, currentTheme } from '../lib/theme-mode'

/**
 * Navigation.
 *
 * Two tiers, because the eight destinations are not eight equal things. Three
 * are where the evening actually happens and you move between them constantly;
 * five are places you visit once. Rendering all eight as identical text links
 * in one strip — which is what this was — gives the eye no way to tell them
 * apart, and on a phone it wrapped onto the page title.
 *
 * So: the working set sits in the bar as a segmented control, because they are
 * mutually exclusive views of the same evening and that is what a segmented
 * control means. Everything else is behind the person's own name, which is
 * where a website puts its account menu and therefore the first place anyone
 * looks.
 */
interface Item {
  to: string
  label: string
  hostOnly?: boolean
}

/** the working set — where the evening happens */
const PRIMARY: Item[] = [
  { to: '/host', label: 'Konsol', hostOnly: true },
  { to: '/oda', label: 'Oda' },
  { to: '/sunum', label: 'Sunum', hostOnly: true },
]

/** visited once, or when something is wrong */
const SECONDARY: Item[] = [
  { to: '/host/uyeler', label: S.members, hostOnly: true },
  { to: '/yillik', label: 'Yıllık', hostOnly: true },
  { to: '/kurallar', label: 'Kurallar' },
  { to: '/profil', label: 'Profil' },
  { to: '/tani', label: 'Tanı' },
]

export default function HostNav() {
  const { member, logout } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const isHost = member?.is_host ?? false
  const primary = PRIMARY.filter((i) => !i.hostOnly || isHost)
  const secondary = SECONDARY.filter((i) => !i.hostOnly || isHost)

  return (
    <div className="flex items-center gap-2 shrink-0">
      {/* Hidden on a phone, where the same three destinations already appear at
          the top of the menu below. Rendering both duplicated the working set
          in two places at once, and cost three sub-44px targets on touch. */}
      {primary.length > 1 && (
        <nav className="segmented hidden sm:inline-flex" aria-label="Görünüm">
          {primary.map((i) => {
            const active = loc.pathname === i.to
            return (
              <Link
                key={i.to}
                to={i.to}
                aria-current={active ? 'page' : undefined}
                className={active ? 'segmented-item-on' : 'segmented-item'}
              >
                {i.label}
              </Link>
            )
          })}
        </nav>
      )}

      <Menu
        label="Menü"
        trigger={
          <>
            <span aria-hidden className="text-base leading-none">
              {member?.avatar || '🙂'}
            </span>
            <span className="hidden sm:inline max-w-28 truncate">{member?.display_name}</span>
            <svg viewBox="0 0 12 12" className="size-2.5 opacity-60" fill="none" aria-hidden>
              <path
                d="M2.5 4.5L6 8L9.5 4.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        }
      >
        {(close) => (
          <>
            {/* on a phone the segmented control is hidden; the working set has
                to be reachable from somewhere, so it is also here */}
            <div className="sm:hidden">
              {primary.map((i) => (
                <MenuItem
                  key={i.to}
                  onClick={() => {
                    close()
                    nav(i.to)
                  }}
                  trailing={loc.pathname === i.to ? '•' : undefined}
                >
                  {i.label}
                </MenuItem>
              ))}
              <MenuSeparator />
            </div>
            {secondary.map((i) => (
              <MenuItem
                key={i.to}
                onClick={() => {
                  close()
                  nav(i.to)
                }}
                trailing={loc.pathname === i.to ? '•' : undefined}
              >
                {i.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem
              onClick={() => {
                applyTheme(currentTheme() === 'dark' ? 'light' : 'dark')
                close()
              }}
              trailing={currentTheme() === 'dark' ? 'Koyu' : 'Açık'}
            >
              Görünüm
            </MenuItem>
            <MenuSeparator />
            <MenuItem tone="danger" onClick={logout}>
              {S.logout}
            </MenuItem>
          </>
        )}
      </Menu>
    </div>
  )
}
