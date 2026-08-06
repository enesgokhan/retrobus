import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import AppShell from '../components/AppShell'
import { liveStatus, onLiveStatusChange } from '../lib/realtime'
import { useAuth } from '../lib/auth'

interface Snap {
  member: string
  host: boolean
  sessionOk: boolean
  expiresInS: number | null
  socketConnected: boolean
  socketState: string
  mode: string
  staleMs: number
  channels: { name: string; mode: string; ageMs: number }[]
  rawChannels: { topic: string; state: string }[]
  online: boolean
  ua: string
}

/**
 * Tanı ekranı.
 *
 * Neden var: bildirilen iki hatayı ("0/1 odada" ve kalıcı yeniden-bağlanıyor
 * uyarısı) uzaktan HİÇ yeniden üretemedim — taze oturumla, eski oturumla, canlı
 * sitede, hepsi temizdi. Sebebi sonradan anlaşıldı: kullanıcının iş ağındaki
 * proxy websocket'i engelliyordu. Bir daha böyle bir şey olursa tahmin etmek
 * yerine bu ekranı okuyacağız.
 *
 * Buradaki her satır, bir sorun yaşandığında bana gönderilebilecek somut bir
 * gerçek. Hiçbiri sır değil: oturum jetonu gösterilmiyor, yalnızca geçerliliği.
 */
type Probe = 'deneniyor…' | 'ok' | 'engelli'

export default function Tani() {
  const { member } = useAuth()
  const [snap, setSnap] = useState<Snap | null>(null)
  const [rpcOk, setRpcOk] = useState<string>('deneniyor…')
  const [probe, setProbe] = useState<Probe>('deneniyor…')

  // The active websocket test. 10s is generous: a working socket joins in well
  // under a second, and a blocked one usually fails fast — the wait is for the
  // network that neither connects nor refuses.
  useEffect(() => {
    let done = false
    const ch = supabase.channel(`tani-probe-${Math.round(performance.now())}`)
    const finish = (r: Probe) => {
      if (done) return
      done = true
      setProbe(r)
      supabase.removeChannel(ch)
    }
    const timer = setTimeout(() => finish('engelli'), 5000)
    ch.subscribe((st) => {
      if (st === 'SUBSCRIBED') { clearTimeout(timer); finish('ok') }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
        clearTimeout(timer); finish('engelli')
      }
    })
    return () => { done = true; clearTimeout(timer); supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    async function read() {
      const { data } = await supabase.auth.getSession()
      const sess = data.session
      const st = liveStatus()
      const rt = supabase.realtime
      setSnap({
        member: member?.display_name ?? '—',
        host: member?.is_host ?? false,
        sessionOk: !!sess,
        expiresInS: sess?.expires_at ? Math.round(sess.expires_at - Date.now() / 1000) : null,
        socketConnected: (() => {
          try {
            return rt.isConnected()
          } catch {
            return false
          }
        })(),
        socketState: (() => {
          try {
            return String(rt.connectionState())
          } catch {
            return 'bilinmiyor'
          }
        })(),
        mode: st.mode,
        staleMs: st.staleMs,
        channels: st.channels,
        rawChannels: supabase.getChannels().map((c) => ({ topic: c.topic, state: String(c.state) })),
        online: navigator.onLine,
        ua: navigator.userAgent.slice(0, 110),
      })
    }
    read()
    const t = setInterval(read, 1500)
    const off = onLiveStatusChange(read)
    return () => {
      clearInterval(t)
      off()
    }
  }, [member])

  // a plain HTTP round trip: proves the database is reachable even with no socket
  useEffect(() => {
    ;(async () => {
      const started = Date.now()
      const { error } = await supabase.rpc('active_member_count')
      setRpcOk(error ? `HATA: ${error.message.slice(0, 60)}` : `çalışıyor (${Date.now() - started}ms)`)
    })()
  }, [])

  const Row = ({ k, v, bad = false }: { k: string; v: string; bad?: boolean }) => (
    <div className="flex justify-between gap-4 border-b border-sep py-1.5 text-subhead">
      <span className="font-semibold text-label-2 shrink-0">{k}</span>
      <span className={['text-right break-all', bad ? 'font-bold text-bad' : 'font-semibold'].join(' ')}>
        {v}
      </span>
    </div>
  )

  return (
    <AppShell
      title="Tanı"
      subtitle="Bir şey ters giderse bu ekranın fotoğrafını gönder. Jeton gösterilmiyor, yalnızca durumu."
      width="reading"
    >

      {!snap ? (
        <p className="text-subhead text-label-2">Okunuyor…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <section className="card flex flex-col">
            <h2 className="text-overline uppercase text-label-3 mb-2.5">Güncelleme yolu</h2>
            {/* This page opens no channels of its own, so the registry has
                nothing to report here. Saying "canlı" in that case would be a
                guess — and this is the one screen that must never guess. */}
            {/* This page opens no channels of its own, and the Realtime client
                does not connect a socket until something subscribes. Treating
                "not connected" as a fault here meant the diagnostics screen —
                the one place you go to find out whether anything is wrong —
                reported a red HAYIR and blamed your proxy while the app was
                perfectly healthy. A screen that cries wolf is worse than no
                screen. Nothing here is red unless something is actually
                broken. */}
            <Row
              k="mod"
              v={
                snap.channels.length === 0
                  ? 'bu sayfada canlı bağlantı gerekmiyor'
                  : snap.mode === 'live'
                    ? 'canlı (websocket)'
                    : 'yoklama (websocket yok)'
              }
              bad={snap.channels.length > 0 && snap.mode !== 'live'}
            />
            {snap.channels.length > 0 && (
              <Row
                k="son yenileme"
                v={`${(snap.staleMs / 1000).toFixed(1)} sn önce`}
                bad={snap.staleMs > 20000}
              />
            )}
            <Row
              k="websocket testi"
              v={
                probe === 'ok'
                  ? 'başarılı — bu ağ websocket destekliyor'
                  : probe === 'engelli'
                    ? 'BAŞARISIZ — websocket KAPALI'
                    : 'deneniyor…'
              }
              bad={probe === 'engelli'}
            />
            <Row
              k="websocket bağlı"
              v={snap.socketConnected ? 'evet' : 'HAYIR'}
              bad={probe === 'engelli'}
            />
            <Row k="websocket durumu" v={snap.socketState} />
            <Row k="tarayıcı çevrimiçi" v={snap.online ? 'evet' : 'HAYIR'} bad={!snap.online} />
            <Row k="veritabanı (düz HTTP)" v={rpcOk} bad={rpcOk.startsWith('HATA')} />
            {probe === 'engelli' && (
              <p className="text-footnote text-label-2 mt-3 leading-relaxed">
                Websocket kurulamıyor — büyük olasılıkla ağdaki bir proxy engelliyor. Uygulama bu
                durumda da çalışır: ekranlar birkaç saniyede bir kendini yeniler.
              </p>
            )}
          </section>

          <section className="card flex flex-col">
            <h2 className="text-overline uppercase text-label-3 mb-2.5">Oturum</h2>
            <Row k="kişi" v={`${snap.member}${snap.host ? ' (şoför)' : ''}`} />
            <Row k="oturum geçerli" v={snap.sessionOk ? 'evet' : 'HAYIR'} bad={!snap.sessionOk} />
            <Row
              k="jeton bitişi"
              v={snap.expiresInS == null ? '—' : `${Math.round(snap.expiresInS / 60)} dk sonra`}
              bad={(snap.expiresInS ?? 1) < 0}
            />
          </section>

          <section className="card flex flex-col">
            <h2 className="text-overline uppercase text-label-3 mb-2.5">Kanallar ({snap.channels.length})</h2>
            {snap.channels.length === 0 && <p className="text-subhead text-label-2">Bu sayfada kanal yok.</p>}
            {snap.channels.map((c) => (
              <Row
                key={c.name}
                k={c.name}
                v={`${c.mode === 'live' ? 'canlı' : 'yoklama'} · ${(c.ageMs / 1000).toFixed(0)} sn`}
                bad={c.mode !== 'live'}
              />
            ))}
            {snap.rawChannels.length > 0 && (
              <div className="mt-3 pt-2 border-t border-sep">
                {snap.rawChannels.map((c) => (
                  <Row key={c.topic} k={c.topic.replace('realtime:', '')} v={c.state} bad={c.state !== 'joined'} />
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="text-overline uppercase text-label-3 mb-2.5">Tarayıcı</h2>
            <p className="text-footnote break-all text-label-2">{snap.ua}</p>
          </section>

          <button className="btn-gray self-start" onClick={() => window.location.reload()}>
            Sayfayı yenile
          </button>
        </div>
      )}
    </AppShell>
  )
}
