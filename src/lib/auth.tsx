import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Member } from './types'
import { IS_CONFIGURED, supabase } from './supabase'

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'wrong' | 'no_code' | 'error' | 'unconfigured'; retryAfterS?: never }
  | { ok: false; reason: 'locked'; retryAfterS: number }

interface AuthCtx {
  member: Member | null
  /** true until we've checked for an existing session */
  loading: boolean
  login: (name: string, code: string) => Promise<LoginResult>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  member: null,
  loading: true,
  login: async () => ({ ok: false, reason: 'error' }),
  logout: async () => {},
})

/** Shape returned by the claim_member RPC (a single jsonb object). */
interface ClaimResult {
  ok: boolean
  reason?: 'invalid' | 'no_code' | 'locked' | 'no_session'
  retry_after_s?: number
  member_id?: string
  display_name?: string
  is_host?: boolean
}

/** Resolves the member linked to the current anonymous auth user, if any. */
async function fetchCurrentMember(): Promise<Member | null> {
  const { data, error } = await supabase.rpc('current_member')
  if (error || !data?.length) return null
  const row = data[0] as Member
  return { id: row.id, display_name: row.display_name, is_host: row.is_host }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore on load: if supabase still holds a session, ask who it maps to.
  useEffect(() => {
    if (!IS_CONFIGURED) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        const m = await fetchCurrentMember()
        if (!cancelled) setMember(m)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (name: string, code: string): Promise<LoginResult> => {
    if (!IS_CONFIGURED) return { ok: false, reason: 'unconfigured' }
    try {
      // Any visitor can hold an anonymous token; it proves nothing on its own.
      // claim_member is what turns it into a member identity.
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) return { ok: false, reason: 'error' }
      }

      const { data, error } = await supabase.rpc('claim_member', {
        p_name: name.trim(),
        p_code: code,
      })
      if (error || !data) return { ok: false, reason: 'error' }

      const result = data as ClaimResult
      if (!result.ok) {
        switch (result.reason) {
          case 'no_code':
            return { ok: false, reason: 'no_code' }
          case 'locked':
            return { ok: false, reason: 'locked', retryAfterS: result.retry_after_s ?? 900 }
          case 'invalid':
            return { ok: false, reason: 'wrong' }
          default:
            return { ok: false, reason: 'error' }
        }
      }
      if (!result.member_id || !result.display_name) return { ok: false, reason: 'error' }

      setMember({
        id: result.member_id,
        display_name: result.display_name,
        is_host: result.is_host ?? false,
      })
      return { ok: true }
    } catch {
      return { ok: false, reason: 'error' }
    }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setMember(null)
  }, [])

  const value = useMemo(() => ({ member, loading, login, logout }), [member, loading, login, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  return useContext(Ctx)
}
