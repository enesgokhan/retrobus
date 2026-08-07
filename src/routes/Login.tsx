import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { S } from '../lib/strings'
import CodeInput from '../components/CodeInput'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import { Field } from '../components/ui/Field'
import Icon from '../components/ui/Icon'

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
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10 gap-8">
        <div className="text-center animate-pop">
          <div className="text-6xl mb-3 leading-none" aria-hidden>
            🎉
          </div>
          <h1 className="text-title-1">
            Hoş geldin{member ? `, ${member.display_name}` : ''}
          </h1>
          <p className="text-body text-label-2 mt-1.5">Kendine bir avatar seç.</p>
        </div>
        <div className="grid grid-cols-6 gap-2.5 max-w-lg w-full stagger">
          {AVATARS.map((a, i) => (
            <button
              key={`${a}-${i}`}
              onClick={() => chooseAvatar(a)}
              aria-label={a}
              className={[
                'aspect-square rounded-md text-2xl min-h-11 grid place-items-center',
                'transition-[background-color,transform,box-shadow] duration-150',
                picked === a
                  ? 'bg-[color-mix(in_srgb,var(--tint)_22%,transparent)] scale-110 shadow-[inset_0_0_0_1px_var(--tint)]'
                  : 'bg-fill-3 hover:bg-fill-2 hover:scale-105',
              ].join(' ')}
            >
              {a}
            </button>
          ))}
        </div>
        <button
          className="btn-plain btn-md !text-label-2"
          onClick={() => navigate(member?.is_host ? '/host' : '/oda', { replace: true })}
        >
          Şimdilik geç
        </button>
      </main>
    )
  }

  // ---------- credentials step ----------
  return (
    <main className="tint-brand min-h-dvh flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden">
      {/* This is the surprise — the moment the app is first seen. A wash
          behind it so the screen is not a black rectangle with a form on it. */}
      <div
        className="absolute inset-x-0 top-0 h-[70vh] pointer-events-none"
        style={{
          background:
            'radial-gradient(70% 60% at 50% 0%, color-mix(in srgb, var(--color-brand) 13%, transparent), transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative w-full max-w-md flex flex-col items-center stagger">
        <div className="mb-5 text-(--tint)">
          <Icon name="bus" size={64} strokeWidth={1.3} />
        </div>
        <h1 className="text-display text-center">{S.appName}</h1>
        <p className="text-body text-label-2 mt-3 mb-9 text-center text-balance">{S.tagline}</p>

        <form onSubmit={onSubmitForm} className="card-lg w-full flex flex-col gap-5">
          <h2 className="text-title-3">{S.loginTitle}</h2>

          <Field
            label={S.loginName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={S.loginNamePlaceholder}
            autoComplete="username"
            // nobody should have to hunt for the first field of a surprise
            autoFocus={!name}
            required
            maxLength={40}
          />

          <div className="flex flex-col gap-2">
            <span className="text-subhead text-label-2">{S.loginCode}</span>
            <CodeInput
              value={code}
              onChange={setCode}
              onComplete={(full) => void submit(full)}
              disabled={busy}
              autoFocus={!!name}
            />
          </div>

          {error && <Alert>{error}</Alert>}

          <Button
            type="submit"
            variant="filled"
            size="lg"
            block
            busy={busy}
            disabled={!name.trim() || code.length !== 6}
          >
            {busy ? (slow ? S.loginWaiting : S.loading) : S.loginButton}
          </Button>
        </form>
      </div>
    </main>
  )
}
