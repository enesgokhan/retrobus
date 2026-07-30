import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type State = 'ok' | 'reconnecting' | 'offline'

/**
 * Bağlantı göstergesi.
 *
 * Neden gerekli: gerçek zamanlı bağlantı düşerse ekran son gördüğü halde
 * KALIYOR. Kullanıcı hiçbir şey olmadığını sanıp bekliyor; şoför sonraki durağa
 * geçmiş ama o hâlâ eskisinde. Üç saatlik bir toplantıda en kötü sessiz hata bu.
 *
 * `liveChannel` her SUBSCRIBED'da yeniden veri çekiyor, yani toparlanma zaten
 * çalışıyor — eksik olan tek şey, bozukken bunu KİŞİYE söylemek.
 */
export default function ConnStatus() {
  const [state, setState] = useState<State>('ok')

  useEffect(() => {
    function check() {
      if (!navigator.onLine) {
        setState('offline')
        return
      }
      // realtime-js exposes the socket; if it is not connected while any channel
      // is joined, we are in a gap the user should know about
      const anyChannels = supabase.getChannels().length > 0
      const connected = supabase.realtime.isConnected()
      setState(anyChannels && !connected ? 'reconnecting' : 'ok')
    }
    check()
    const t = setInterval(check, 3000)
    const on = () => check()
    window.addEventListener('online', on)
    window.addEventListener('offline', on)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', on)
    }
  }, [])

  if (state === 'ok') return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-40 rounded-full px-4 py-2.5',
        'text-sm font-bold shadow-lg border-2 flex items-center gap-2',
        state === 'offline'
          ? 'bg-ink text-white border-ink'
          : 'bg-amber-soft text-ink border-amber',
      ].join(' ')}
    >
      <span aria-hidden className="animate-pulse">
        {state === 'offline' ? '📴' : '🔄'}
      </span>
      {state === 'offline'
        ? 'İnternet yok — bağlanınca kaldığın yerden devam edeceksin.'
        : 'Yeniden bağlanıyor… ekran birazdan güncellenecek.'}
    </div>
  )
}
