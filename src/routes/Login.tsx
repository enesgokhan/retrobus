import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { S } from '../lib/strings'
import CodeInput from '../components/CodeInput'

const LAST_NAME_KEY = 'retrobus.lastName'

const AVATARS = [
  '🦊', '🐼', '🐙', '🦉', '🐝', '🦔', '🐧', '🦁',
  '🐳', '🦄', '🐢', '🦋', '🐨', '🦩', '🐺', '🦇',
  '🍕', '🌮', '🍩', '☕', '🎸', '🚀', '⚡', '🌵',
]

/**
 * Otobüse binme ekranı.
 *
 * Bu, arkadaşların uygulamayı ilk gördüğü an; sürpriz gibi mi form gibi mi
 * hissettireceğine burada karar veriliyor. O yüzden: oyun PIN'i gibi ayrı kod
 * kutuları, girişin kendisinde avatar seçimi (profilin dibine gömülü değil) ve
 * girdikten sonra şoförün yazdığı karşılama mesajı.
 */
export default function Login() {
  const { member, login, patchMember } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(() => localStorage.getItem(LAST_NAME_KEY) ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  // when everyone opens the link at once the server queues us; after a few
  // seconds say so, instead of showing a stuck-looking spinner
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** after a successful claim we ask for an avatar before entering the room */
  const [step, setStep] = useState<'credentials' | 'avatar'>('credentials')
  const [picked, setPicked] = useState<string | null>(null)

  if (member && step === 'credentials') {
    return <Navigate to={member.is_host ? '/host' : '/oda'} replace />
  }

  async function submit(codeOverride?: string) {
    const theCode = codeOverride ?? code
    if (busy) return
    setError(null)
    if (!name.trim()) {
      setError('Adını yaz.')
      return
    }
    if (!/^\d{6}$/.test(theCode)) {
      setError(S.codeInvalid)
      return
    }
    setBusy(true)
    setSlow(false)
    const slowTimer = setTimeout(() => setSlow(true), 3500)
    const result = await login(name, theCode)
    clearTimeout(slowTimer)
    setSlow(false)
    setBusy(false)
    if (result.ok) {
      localStorage.setItem(LAST_NAME_KEY, name.trim())
      setStep('avatar')
      return
    }
    switch (result.reason) {
      case 'wrong': setError(S.loginWrong); break
      case 'no_code': setError(S.loginNoCode); break
      case 'locked': setError(S.loginLocked(result.retryAfterS)); break
      case 'unconfigured': setError(S.loginUnconfigured); break
      case 'rate_limited': setError(S.loginRateLimited); break
      default: setError(S.loginError)
    }
    setCode('')
  }

  async function chooseAvatar(a: string) {
    setPicked(a)
    if (member) {
      await supabase.from('members').update({ avatar: a }).eq('id', member.id)
      // reflect it locally too, or the header keeps showing the fallback face
      patchMember({ avatar: a })
    }
    setTimeout(() => navigate(member?.is_host ? '/host' : '/oda', { replace: true }), 350)
  }

  function onSubmitForm(e: FormEvent) {
    e.preventDefault()
    void submit()
  }

  // ---------- avatar step ----------
  if (step === 'avatar') {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10 gap-6">
        <div className="text-center">
          <div className="text-6xl mb-2 animate-bounce" aria-hidden>
            🎉
          </div>
          <h1 className="text-3xl font-extrabold">Hoş geldin{member ? `, ${member.display_name}` : ''}!</h1>
          <p className="text-ink-soft font-semibold mt-1">Kendine bir avatar seç.</p>
        </div>
        <div className="grid grid-cols-6 gap-3 max-w-lg w-full">
          {AVATARS.map((a, i) => (
            <button
              key={`${a}-${i}`}
              onClick={() => chooseAvatar(a)}
              aria-label={a}
              className={[
                'aspect-square rounded-2xl border-2 text-2xl transition min-h-11',
                picked === a ? 'border-coral bg-rose-soft scale-110' : 'border-line hover:border-coral hover:scale-105',
              ].join(' ')}
            >
              {a}
            </button>
          ))}
        </div>
        <button
          className="text-ink-soft underline text-sm min-h-11"
          onClick={() => navigate(member?.is_host ? '/host' : '/oda', { replace: true })}
        >
          Şimdilik geç
        </button>
      </main>
    )
  }

  // ---------- credentials step ----------
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10">
      {/* This is the surprise. It was a 380px phone form on a 1600px canvas
          with nothing focused and nothing moving. */}
      <div className="text-8xl mb-3 animate-bus-in" aria-hidden>
        🚌
      </div>
      <h1 className="text-6xl font-extrabold tracking-tight animate-rise-1">{S.appName}</h1>
      <p className="text-ink-soft mt-2 mb-8 text-center max-w-sm text-lg animate-rise-2">{S.tagline}</p>

      <form onSubmit={onSubmitForm} className="card w-full max-w-md flex flex-col gap-5 animate-rise-3">
        <h2 className="text-xl font-bold">{S.loginTitle}</h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-soft">{S.loginName}</span>
          <input
            className="input-blob"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={S.loginNamePlaceholder}
            autoComplete="username"
            // nobody should have to hunt for the first field of a surprise
            autoFocus={!name}
            required
            maxLength={40}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-ink-soft">{S.loginCode}</span>
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={(full) => void submit(full)}
            disabled={busy}
            autoFocus={!!name}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
            {error}
          </p>
        )}

        <button type="submit" className="btn-coral text-lg" disabled={busy || !name.trim() || code.length !== 6}>
          {busy ? (slow ? S.loginWaiting : S.loading) : S.loginButton}
        </button>
      </form>
    </main>
  )
}
