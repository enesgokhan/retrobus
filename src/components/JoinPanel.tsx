import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import type { Meeting } from '../lib/types'

/**
 * The room code, as the host shows it to the room.
 *
 * Built for a shared screen: the code is the biggest thing on it, because that
 * is what someone across a video call has to read off a compressed stream, and
 * the QR is there for whoever has a phone in their hand. The URL is rendered as
 * text too — a QR is useless to anyone joining from the same laptop.
 *
 * The QR is generated locally. A hosted QR service would be a third party
 * learning the address of a private meeting, for no benefit.
 */
export default function JoinPanel({ meeting, compact = false }: { meeting: Meeting; compact?: boolean }) {
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const code = meeting.join_code ?? ''

  // #/kat/CODE — the hash router means this is a real, shareable address
  const url = `${window.location.origin}${window.location.pathname}#/kat/${code}`

  useEffect(() => {
    if (!code) return
    let cancelled = false
    QRCode.toString(url, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#ecedef', light: '#00000000' },
    })
      .then((svg) => { if (!cancelled) setQr(svg) })
      .catch(() => { if (!cancelled) setQr(null) })
    return () => { cancelled = true }
  }, [url, code])

  async function toggleOpen() {
    setBusy(true)
    await supabase.from('meetings').update({ join_open: !meeting.join_open }).eq('id', meeting.id)
    setBusy(false)
  }

  if (!code) return null

  return (
    <section className={['card flex gap-5', compact ? 'items-center' : 'items-start flex-wrap'].join(' ')}>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-widest text-ink-faint font-medium">Katılım kodu</p>
        <p
          className={[
            'font-semibold tabular-nums tracking-[0.2em] mt-1',
            compact ? 'text-3xl' : 'text-5xl',
          ].join(' ')}
        >
          {code}
        </p>
        <p className="text-sm text-ink-soft mt-2 break-all">{url.replace(/^https?:\/\//, '')}</p>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            className="btn-ghost text-xs"
            onClick={() => void navigator.clipboard?.writeText(url)}
          >
            Bağlantıyı kopyala
          </button>
          <button className="btn-ghost text-xs" onClick={toggleOpen} disabled={busy}>
            {meeting.join_open ? 'Katılımı kapat' : 'Katılımı aç'}
          </button>
          {!meeting.join_open && (
            <span className="text-xs font-medium text-ink-faint">Kapalı — yeni kimse giremez.</span>
          )}
        </div>
      </div>

      {qr && (
        <div
          className={['shrink-0 rounded-[--radius-surface] bg-[--color-raised] p-3', compact ? 'w-28' : 'w-40'].join(' ')}
          aria-label="Katılım karekodu"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      )}
    </section>
  )
}
