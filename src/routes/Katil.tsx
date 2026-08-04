import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { S } from '../lib/strings'

/**
 * Joining by room code — the screen behind the QR.
 *
 * Someone who has never seen this app scans a code on a shared screen and lands
 * here. They have no account, no invitation and no idea what this is, so the
 * screen has exactly two jobs: say what they are joining, and take their name.
 *
 * The anonymous sign-in happens here rather than on submit, so the wait is
 * spent while they are typing instead of after they press the button — and the
 * sign-in burst when a room joins at once is spread over however long it takes
 * ten people to type their names.
 */
export default function Katil() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [title, setTitle] = useState<string | null>(null)
  const [state, setState] = useState<'checking' | 'ready' | 'unknown' | 'closed'>('checking')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // a session first: peek_meeting is only callable by an authenticated role
      const { data } = await supabase.auth.getSession()
      if (!data.session) await supabase.auth.signInAnonymously()
      const { data: peek } = await supabase.rpc('peek_meeting', { p_code: code })
      if (cancelled) return
      const p = peek as { ok: boolean; title?: string; open?: boolean } | null
      if (!p?.ok) { setState('unknown'); return }
      setTitle(p.title ?? null)
      setState(p.open ? 'ready' : 'closed')
    })()
    return () => { cancelled = true }
  }, [code])

  async function join() {
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('join_meeting', {
      p_code: code,
      p_name: name.trim(),
    })
    setBusy(false)
    const r = data as { ok: boolean; reason?: string } | null
    if (e || !r?.ok) {
      setError(
        r?.reason === 'closed' ? 'Katılım kapandı — toplantıyı yöneten kişiye söyle.'
        : r?.reason === 'unknown_code' ? 'Bu kod artık geçerli değil.'
        : r?.reason === 'bad_name' ? 'Bir isim yaz.'
        : r?.reason === 'name_taken' ? 'Bu isim alınmış — başka bir şey dene.'
        : r?.reason === 'full' ? 'Oda dolu.'
        : 'Katılamadık, tekrar dene.',
      )
      return
    }
    await refresh()
    nav('/oda')
  }

  return (
    <main className="min-h-dvh grid place-items-center px-5">
      <div className="w-full max-w-sm">
        <p className="text-sm text-ink-soft">{S.appName}</p>

        {state === 'checking' && <p className="mt-6 text-ink-soft">{S.loading}</p>}

        {state === 'unknown' && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight mt-2">Bu kod çalışmıyor</h1>
            <p className="text-ink-soft mt-2 text-sm">
              Kod yanlış yazılmış olabilir, ya da toplantı henüz başlamamış. Toplantıyı yöneten kişiye sor.
            </p>
          </>
        )}

        {state === 'closed' && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight mt-2">Katılım kapalı</h1>
            <p className="text-ink-soft mt-2 text-sm">
              {title ? `“${title}” başlamış.` : 'Toplantı başlamış.'} Katılım kapatılmış. Açılmasını iste.
            </p>
          </>
        )}

        {state === 'ready' && (
          <>
            <h1 className="text-3xl font-semibold tracking-tight mt-2">{title ?? 'Toplantı'}</h1>
            <p className="text-ink-soft mt-2 text-sm">Adını yaz, hemen katıl.</p>

            <label className="block mt-6">
              <span className="text-sm text-ink-soft">Adın</span>
              <input
                className="input-blob mt-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void join() }}
                placeholder="örn. Enes"
                maxLength={40}
                autoFocus
                autoComplete="name"
              />
            </label>

            {error && <p className="text-sm text-[#ff8a7a] mt-3">{error}</p>}

            <button className="btn-coral w-full mt-4" onClick={join} disabled={!name.trim() || busy}>
              {busy ? S.loading : 'Katıl'}
            </button>

            <p className="text-xs text-ink-faint mt-4">
              Kendi adını yazıyorsun — bu isim odadaki herkese görünür.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
