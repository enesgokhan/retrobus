import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { S } from '../lib/strings'

const LAST_NAME_KEY = 'retrobus.lastName'

export default function Login() {
  const { session, login } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(() => localStorage.getItem(LAST_NAME_KEY) ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session) return <Navigate to={session.member.is_host ? '/host' : '/oda'} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (!/^\d{6}$/.test(code)) {
      setError(S.codeInvalid)
      return
    }
    setBusy(true)
    const result = await login(name, code)
    setBusy(false)
    if (result.ok) {
      localStorage.setItem(LAST_NAME_KEY, name.trim())
      navigate('/oda', { replace: true })
      return
    }
    switch (result.reason) {
      case 'wrong':
        setError(S.loginWrong)
        break
      case 'no_code':
        setError(S.loginNoCode)
        break
      case 'locked':
        setError(S.loginLocked(result.retryAfterS))
        break
      case 'unconfigured':
        setError(S.loginUnconfigured)
        break
      default:
        setError(S.loginError)
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-10">
      <div className="text-7xl mb-3" aria-hidden>
        🚌
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight">{S.appName}</h1>
      <p className="text-ink-soft mt-1 mb-8 text-center max-w-xs">{S.tagline}</p>

      <form onSubmit={onSubmit} className="card w-full max-w-sm flex flex-col gap-4">
        <h2 className="text-xl font-bold">{S.loginTitle}</h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-soft">{S.loginName}</span>
          <input
            className="input-blob"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={S.loginNamePlaceholder}
            autoComplete="username"
            required
            maxLength={40}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-soft">{S.loginCode}</span>
          <input
            className="input-blob tracking-[0.5em] text-center text-2xl font-bold"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            inputMode="numeric"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
            {error}
          </p>
        )}
        <button type="submit" className="btn-coral text-lg" disabled={busy || !name.trim() || code.length !== 6}>
          {busy ? S.loading : S.loginButton}
        </button>
      </form>
    </main>
  )
}
