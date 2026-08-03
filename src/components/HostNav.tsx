import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { S } from '../lib/strings'

interface Item {
  to: string
  label: string
  hostOnly?: boolean
  /** pushed to the right, away from the working set */
  utility?: boolean
}

/**
 * Emoji used to stand in for icons here. At nav size they read as noise rather
 * than meaning — eight different pictograms competing along one strip — and two
 * of them were the same book. Text labels with a quiet active state carry the
 * same information and let the eye find the one live item.
 */
const ITEMS: Item[] = [
  { to: '/host', label: 'Konsol', hostOnly: true },
  { to: '/oda', label: 'Oda' },
  { to: '/sunum', label: 'Sunum', hostOnly: true },
  { to: '/host/uyeler', label: S.members, hostOnly: true },
  { to: '/yillik', label: 'Yıllık', hostOnly: true },
  { to: '/kurallar', label: 'Kurallar', utility: true },
  { to: '/profil', label: 'Profil', utility: true },
  { to: '/tani', label: 'Tanı', utility: true },
]

/**
 * Tek gezinme bileşeni.
 *
 * Neden var: telefonda başlık iki satıra kayıyor ve yedi metin bağlantısı onun
 * ÜZERİNE biniyordu — ekran görüntüsünde "Yolcular" tam olarak "Şoför Konsolu"
 * yazısının üstüne basılmıştı. Ayrıca bağlantılar 20px yüksekliğindeydi;
 * dokunma hedefi için önerilen ~44px.
 *
 * Çözüm: küçük ekranda ikon şeridi (44px kare), geniş ekranda ikon + etiket.
 * Başlık asla gezinmeyle aynı satırı paylaşmaz.
 */
export default function HostNav() {
  const { member, logout } = useAuth()
  const loc = useLocation()
  const isHost = member?.is_host ?? false
  const items = ITEMS.filter((i) => !i.hostOnly || isHost)

  return (
    <nav className="flex items-center gap-0.5 flex-wrap">
      {items.map((i, idx) => {
        const firstUtility = i.utility && !items[idx - 1]?.utility
        const active = loc.pathname === i.to
        return (
          <Link
            key={i.to}
            to={i.to}
            title={i.label}
            aria-label={i.label}
            aria-current={active ? 'page' : undefined}
            className={[
              'min-h-9 px-3 rounded-[--radius-control] inline-flex items-center justify-center',
              'text-sm font-medium transition-[color,background-color] duration-150',
              firstUtility ? 'ml-3' : '',
              active
                ? 'text-ink bg-raised shadow-[inset_0_0_0_1px_var(--color-line)]'
                : 'text-ink-faint hover:text-ink-soft',
            ].join(' ')}
          >
            {i.label}
          </Link>
        )
      })}
      <button
        onClick={logout}
        title={S.logout}
        className="ml-1 min-h-9 px-3 rounded-[--radius-control] inline-flex items-center justify-center
          text-sm font-medium text-ink-faint hover:text-ink-soft transition-colors duration-150"
      >
        {S.logout}
      </button>
    </nav>
  )
}
