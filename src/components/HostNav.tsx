import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { S } from '../lib/strings'

interface Item {
  to: string
  icon: string
  label: string
  hostOnly?: boolean
}

const ITEMS: Item[] = [
  { to: '/host', icon: '🚌', label: 'Konsol', hostOnly: true },
  { to: '/oda', icon: '🪑', label: 'Oda' },
  { to: '/host/uyeler', icon: '🧑‍🤝‍🧑', label: S.members, hostOnly: true },
  { to: '/sunum', icon: '🖥', label: 'Sunum', hostOnly: true },
  { to: '/kurallar', icon: '📖', label: 'Kurallar' },
  { to: '/yillik', icon: '📖', label: 'Yıllık', hostOnly: true },
  { to: '/profil', icon: '🙂', label: 'Profil' },
  { to: '/tani', icon: '🩺', label: 'Tanı' },
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
    <nav className="flex items-center gap-1 flex-wrap">
      {items.map((i) => {
        const active = loc.pathname === i.to
        return (
          <Link
            key={i.to}
            to={i.to}
            title={i.label}
            aria-label={i.label}
            aria-current={active ? 'page' : undefined}
            className={[
              // 44px minimum touch target in both axes
              'min-h-11 min-w-11 px-2.5 rounded-2xl inline-flex items-center justify-center gap-1.5',
              'text-sm font-bold transition',
              active ? 'bg-coral text-white' : 'text-ink-soft hover:bg-line/60',
            ].join(' ')}
          >
            <span aria-hidden className="text-base leading-none">
              {i.icon}
            </span>
            {/* label appears only when there is room for it */}
            <span className="hidden lg:inline">{i.label}</span>
          </Link>
        )
      })}
      <button
        onClick={logout}
        title={S.logout}
        aria-label={S.logout}
        className="min-h-11 min-w-11 px-2.5 rounded-2xl inline-flex items-center justify-center gap-1.5
          text-sm font-bold text-ink-soft hover:bg-line/60 transition"
      >
        <span aria-hidden className="text-base leading-none">
          🚪
        </span>
        <span className="hidden lg:inline">{S.logout}</span>
      </button>
    </nav>
  )
}
