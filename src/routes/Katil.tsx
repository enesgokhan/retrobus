import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { S } from '../lib/strings'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import Icon from '../components/ui/Icon'

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
    <main className="tint-brand min-h-dvh grid place-items-center px-5 py-10 relative overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-[60vh] pointer-events-none"
        style={{
          background:
            'radial-gradient(70% 60% at 50% 0%, color-mix(in srgb, var(--color-brand) 12%, transparent), transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative w-full max-w-sm animate-rise">
        <div className="mb-5 text-label-3">
          <Icon name="bus" size={40} />
        </div>
        <p className="text-overline uppercase text-label-3">{S.appName}</p>

        {state === 'checking' && <p className="mt-4 text-subhead text-label-2">{S.loading}</p>}

        {state === 'unknown' && (
          <>
            <h1 className="text-title-1 mt-2">Bu kod çalışmıyor</h1>
            <p className="text-body text-label-2 mt-3 leading-relaxed">
              Kod yanlış yazılmış olabilir, ya da toplantı henüz başlamamış. Toplantıyı yöneten
              kişiye sor.
            </p>
          </>
        )}

        {state === 'closed' && (
          <>
            <h1 className="text-title-1 mt-2">Katılım kapalı</h1>
            <p className="text-body text-label-2 mt-3 leading-relaxed">
              {title ? `“${title}” başlamış.` : 'Toplantı başlamış.'} Katılım kapatılmış. Açılmasını
              iste.
            </p>
          </>
        )}

        {state === 'ready' && (
          <>
            <h1 className="text-title-1 mt-2 text-balance">{title ?? 'Toplantı'}</h1>
            <p className="text-body text-label-2 mt-2">Adını yaz, hemen katıl.</p>

            <div className="mt-7 flex flex-col gap-3">
              <Field
                label="Adın"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void join()
                }}
                placeholder="örn. Enes"
                maxLength={40}
                autoFocus
                autoComplete="name"
                error={error}
              />

              <Button
                variant="filled"
                size="lg"
                block
                onClick={join}
                busy={busy}
                disabled={!name.trim()}
              >
                Katıl
              </Button>
            </div>

            <p className="text-footnote text-label-3 mt-5 leading-relaxed">
              Kendi adını yazıyorsun — bu isim odadaki herkese görünür.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
