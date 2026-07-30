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
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-5 py-8"
      role="dialog"
      aria-modal="true"
      aria-label="Karşılama"
      onClick={dismiss}
    >
      <div
        className="bg-card rounded-3xl border-2 border-coral max-w-md w-full p-6 flex flex-col gap-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="text-5xl mb-2" aria-hidden>
            🚌
          </div>
          <h2 className="text-2xl font-extrabold">Hoş geldin!</h2>
        </div>
        {/* the host's own words, preserved exactly as typed */}
        <p className="whitespace-pre-wrap text-center leading-relaxed">{note}</p>
        <button className="btn-coral text-lg" onClick={dismiss}>
          Hadi başlayalım
        </button>
      </div>
    </div>
  )
}
