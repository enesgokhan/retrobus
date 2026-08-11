import { useEffect, useState } from 'react'
import { liveStatus, onLiveStatusChange } from '../lib/realtime'
import Icon from './ui/Icon'

type Shown = 'none' | 'polling' | 'stale' | 'offline'

/** How long a state must hold before we show it, so nothing flickers. */
const SETTLE_MS = 3000
/** No successful refresh for this long is genuinely worth alarming about. */
const STALE_MS = 20000

/**
 * Bağlantı göstergesi — gerçeği söyleyen sürümü.
 *
 * Önceki hâli `realtime.isConnected()` gibi iç durumlara bakıyordu ve iki yönde
 * de yanlıştı: geçici durumlarda yanıp sönüyor (kullanıcıya "sürekli açık" gibi
 * geliyordu), bağlantı gerçekten öldüğünde ise susuyordu. Ölçtüm: websocket
 * engellendiğinde 3. saniyede uyarı çıkıyor, 8. saniyede kayboluyor, bağlantı
 * hâlâ yok. Böyle bir gösterge yok olmasından kötüdür, çünkü göz ardı etmeyi
 * öğretir.
 *
 * Şimdi karar, kanalların KENDİ bildirdiği duruma ve son başarılı veri
 * yenilemesinin yaşına dayanıyor:
 *   live    → hiçbir şey gösterme
 *   polling → sakin bilgi: canlı bağlantı yok, birkaç saniyede bir yenileniyor
 *             (kullanıcı için bozuk bir şey yok, o yüzden alarm da yok)
 *   stale   → 20 saniyedir yenilenemedi: tek gerçek alarm, üstelik "Yenile"
 *             düğmesiyle — sorunu anlatmak yetmez, çözümü de sun
 */
export default function ConnStatus() {
  const [shown, setShown] = useState<Shown>('none')
  /**
   * How long the current message has been up.
   *
   * "Canlı bağlantı yok" is true and worth saying once — but on a network that
   * blocks WebSockets outright (the author's own office) it is true for the
   * whole three hours, and a banner that never leaves stops being information
   * and becomes furniture. After a while it shrinks to a dot you can press to
   * read it again. The alarming states never shrink: those need acting on.
   */
  const [age, setAge] = useState(0)
  const [reopened, setReopened] = useState(0)

  useEffect(() => {
    let candidate: Shown = 'none'
    let since = 0

    function evaluate() {
      const now = Date.now()
      const { mode, staleMs, channels } = liveStatus()

      let want: Shown = 'none'
      if (!navigator.onLine) want = 'offline'
      // Staleness only means something while we are POLLING. With a healthy
      // socket, lastOk advances only when a row actually changes — so a quiet
      // room (a spymaster thinking, the host talking over the leaderboard)
      // aged the clock and raised "Ekran güncellenemiyor" on a perfectly good
      // connection. That is the false alarm this component was rebuilt to kill,
      // reintroduced from the other end.
      else if (mode === 'polling' && channels.length && staleMs > STALE_MS) want = 'stale'
      else if (mode === 'polling') want = 'polling'

      // Recovery is instant; degradation has to settle first.
      if (want === 'none') {
        candidate = 'none'
        since = 0
        setShown('none')
        setAge(0)
        return
      }
      if (want !== candidate) {
        candidate = want
        since = now
        return
      }
      if (now - since >= SETTLE_MS) {
        setShown(want)
        setAge(Math.round((now - since - SETTLE_MS) / 1000))
      }
    }

    evaluate()
    const t = setInterval(evaluate, 1000)
    const off = onLiveStatusChange(evaluate)
    window.addEventListener('online', evaluate)
    window.addEventListener('offline', evaluate)
    return () => {
      clearInterval(t)
      off()
      window.removeEventListener('online', evaluate)
      window.removeEventListener('offline', evaluate)
    }
  }, [])

  if (shown === 'none') return null

  const alarming = shown === 'stale' || shown === 'offline'
  // shrink only the calm, permanent one, and only once it has been read
  const collapsed = !alarming && age > 12 && Date.now() - reopened > 12000

  if (collapsed) {
    return (
      <button
        /* The hook goes on BOTH render paths. The indicator shrinks to this dot
           once the calm state has been read, so tagging only the expanded
           banner meant every check ran against an element that had already
           been replaced. */
        data-conn-status
        aria-label="Canlı bağlantı yok — birkaç saniyede bir yenileniyor"
        title="Canlı bağlantı yok — birkaç saniyede bir yenileniyor."
        onClick={() => setReopened(Date.now())}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 size-8 rounded-full
          material-raised shadow-2 grid place-items-center text-caption"
      >
        <Icon name="refresh" size={15} />
      </button>
    )
  }

  return (
    <div
      role="status"
      /* a stable hook: the e2e gate asserts this is absent on a healthy
         connection, and matching on role="status" alone caught any other
         live region on the page — the room's stop announcer, for one */
      data-conn-status
      aria-live="polite"
      className={[
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-full pl-4 pr-3 py-2 animate-rise',
        'text-subhead shadow-2 flex items-center gap-2 max-w-[92vw] material-raised',
        alarming ? 'text-label' : 'text-label-2',
      ].join(' ')}
      style={
        alarming
          ? { boxShadow: 'var(--shadow-2), inset 0 0 0 1px color-mix(in srgb, var(--color-warn) 45%, transparent)' }
          : undefined
      }
    >
      <span aria-hidden>{shown === 'offline' ? '📴' : shown === 'stale' ? '⚠️' : '🔄'}</span>
      <span className="truncate">
        {shown === 'offline'
          ? 'İnternet yok — bağlanınca kaldığın yerden devam edeceksin.'
          : shown === 'stale'
            ? 'Ekran güncellenemiyor.'
            : 'Canlı bağlantı yok — birkaç saniyede bir yenileniyor.'}
      </span>
      {alarming && (
        <button
          className="shrink-0 rounded-full bg-fill px-3 py-1 text-footnote font-semibold hover:bg-fill-2"
          onClick={() => window.location.reload()}
        >
          Yenile
        </button>
      )}
    </div>
  )
}
