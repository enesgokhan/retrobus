import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from './types'
import { FUNCTIONS_URL, resetSupabase } from './supabase'

const STORAGE_KEY = 'retrobus.session'

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'wrong' | 'no_code' | 'error'; retryAfterS?: never }
  | { ok: false; reason: 'locked'; retryAfterS: number }

interface AuthCtx {
  session: Session | null
  login: (name: string, code: string) => Promise<LoginResult>
  logout: () => void
}

const Ctx = createContext<AuthCtx>({ session: null, login: async () => ({ ok: false, reason: 'error' }), logout: () => {} })

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (!s.token || !s.member?.id) return null
    if (s.exp * 1000 < Date.now() + 60_000) return null // expired or about to
    return s
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(loadSession)

  // Drop the session automatically when the token expires mid-meeting.
  useEffect(() => {
    if (!session) return
    const ms = session.exp * 1000 - Date.now()
    const t = setTimeout(() => setSession(null), Math.max(ms, 0))
    return () => clearTimeout(t)
  }, [session])

  const login = useCallback(async (name: string, code: string): Promise<LoginResult> => {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), code }),
      })
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}))
        return { ok: false, reason: 'locked', retryAfterS: Number(body.retry_after_s) || 900 }
      }
      if (res.status === 403) return { ok: false, reason: 'no_code' }
      if (!res.ok) return { ok: false, reason: res.status === 401 ? 'wrong' : 'error' }
      const s = (await res.json()) as Session
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
      resetSupabase()
      setSession(s)
      return { ok: true }
    } catch {
      return { ok: false, reason: 'error' }
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    resetSupabase()
    setSession(null)
  }, [])

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  return useContext(Ctx)
}
