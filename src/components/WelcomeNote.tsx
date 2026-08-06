import { useEffect, useState } from 'react'

const SEEN_KEY = 'retrobus.welcomeSeen'

/**
 * Şoförün yazdığı karşılama mesajı — herkese bir kez.
 *
 * Metin Enes'in; uygulama yalnızca taşıyor. Bir kez gösterilir (meeting id'ye
 * göre localStorage'da işaretlenir), böylece her sayfa yenilemede tekrar
 * çıkmıyor ama yeni bir toplantıda yeniden görünüyor.
 */
export default function WelcomeNote({ meetingId, note }: { meetingId: string; note: string | null }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!note?.trim()) return
    try {
      const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, boolean>
      if (!seen[meetingId]) setOpen(true)
    } catch {
      setOpen(true)
    }
  }, [meetingId, note])

  function dismiss() {
    try {
      const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, boolean>
      seen[meetingId] = true
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
    } catch {
      /* a failed write only means it shows again — harmless */
    }
    setOpen(false)
  }

  if (!open || !note?.trim()) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-5 py-8 animate-fade"
      role="dialog"
      aria-modal="true"
      aria-label="Karşılama"
    >
      <div
        className="bg-bg-3 rounded-lg shadow-3 max-w-md w-full p-7 flex flex-col gap-5 animate-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center text-4xl leading-none" aria-hidden>
          🚌
        </div>
        {/* the host's own words, preserved exactly as typed, and given the floor */}
        <p className="whitespace-pre-wrap text-center text-body leading-relaxed">{note}</p>
        <p className="text-center text-footnote text-label-3">— Enes</p>
        <button className="btn-filled btn-lg w-full" onClick={dismiss}>
          Hadi başlayalım
        </button>
      </div>
    </div>
  )
}
