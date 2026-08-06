import { S } from '../lib/strings'

/**
 * Şoför "dondur"a bastığında herkesin gördüğü ekran.
 * Bilerek sakin ve bilgisiz: bir durak kötü gidiyorsa oradaki içeriğin
 * ekranlarda kalmaması gerekir.
 */
export default function FrozenScreen({ note, big = false }: { note?: string | null; big?: boolean }) {
  return (
    <div className="text-center max-w-lg animate-fade">
      <div className={[big ? 'text-8xl mb-8' : 'text-6xl mb-5', 'leading-none'].join(' ')} aria-hidden>
        ☕
      </div>
      <h2 className={[big ? 'text-display' : 'text-title-1', 'mb-3'].join(' ')}>{S.frozenTitle}</h2>
      <p className={[big ? 'text-title-3' : 'text-body', 'text-label-2 text-balance'].join(' ')}>
        {note?.trim() || S.frozenBody}
      </p>
    </div>
  )
}
