import { S } from '../lib/strings'

/**
 * Şoför "dondur"a bastığında herkesin gördüğü ekran.
 * Bilerek sakin ve bilgisiz: bir durak kötü gidiyorsa oradaki içeriğin
 * ekranlarda kalmaması gerekir.
 */
export default function FrozenScreen({ note, big = false }: { note?: string | null; big?: boolean }) {
  return (
    <div className="text-center max-w-md">
      <div className={big ? 'text-9xl mb-6' : 'text-7xl mb-4'} aria-hidden>
        ☕
      </div>
      <h2 className={big ? 'text-5xl font-extrabold mb-2' : 'text-2xl font-extrabold mb-1'}>
        {S.frozenTitle}
      </h2>
      <p className={big ? 'text-2xl text-ink-soft' : 'text-ink-soft'}>{note?.trim() || S.frozenBody}</p>
    </div>
  )
}
