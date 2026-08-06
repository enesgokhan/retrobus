import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import Button from './ui/Button'
import type { Meeting } from '../lib/types'

/**
 * The room code, as the host shows it to the room.
 *
 * Built for a shared screen: the code is the biggest thing on it, because that
 * is what someone across a compressed video stream has to read off it, and the
 * QR is there for whoever has a phone in their hand. The URL is rendered as
 * text too — a QR is useless to anyone joining from the same laptop.
 *
 * Letter-spacing on the code is not decoration. `M743RY` at normal tracking is
 * misread as `M743PY` over a video call about as often as not; separated
 * glyphs are read one at a time.
 *
 * The QR is generated locally. A hosted QR service would be a third party
 * learning the address of a private meeting, for no benefit.
 */
export default function JoinPanel({
  meeting,
  compact = false,
}: {
  meeting: Meeting
  compact?: boolean
}) {
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
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
      color: { dark: '#f5f5f7', light: '#00000000' },
    })
      .then((svg) => {
        if (!cancelled) setQr(svg)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [url, code])

  async function toggleOpen() {
    setBusy(true)
    await supabase.from('meetings').update({ join_open: !meeting.join_open }).eq('id', meeting.id)
    setBusy(false)
  }

  async function copy() {
    await navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  if (!code) return null

  return (
    <section className="card-lg flex gap-6 items-center flex-wrap">
      <div className="min-w-0 flex-1">
        <p className="text-overline uppercase text-label-3">Katılım kodu</p>
        <p
          className={[
            'nums font-bold tracking-[0.18em] mt-1.5 leading-none',
            compact ? 'text-title-1' : 'text-display',
          ].join(' ')}
        >
          {code}
        </p>
        <p className="text-footnote text-label-3 mt-2.5 break-all">
          {url.replace(/^https?:\/\//, '')}
        </p>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Button size="sm" variant={copied ? 'tinted' : 'gray'} onClick={copy}>
            {copied ? 'Kopyalandı' : 'Bağlantıyı kopyala'}
          </Button>
          <Button size="sm" onClick={toggleOpen} busy={busy}>
            {meeting.join_open ? 'Katılımı kapat' : 'Katılımı aç'}
          </Button>
          {!meeting.join_open && (
            <span className="text-footnote text-label-3">Kapalı — yeni kimse giremez.</span>
          )}
        </div>
      </div>

      {qr && (
        <div
          className={[
            'shrink-0 rounded-md bg-bg-2 p-3.5',
            compact ? 'w-32' : 'w-44',
          ].join(' ')}
          aria-label="Katılım karekodu"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      )}
    </section>
  )
}
