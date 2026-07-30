import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Session } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const SUPABASE_URL = url
export const FUNCTIONS_URL = url ? `${url}/functions/v1` : ''

let client: SupabaseClient | null = null
let currentToken: string | null = null

/**
 * Single shared client. We do NOT use supabase-auth (login is our own
 * 6-digit-code edge function); instead every request carries the custom JWT.
 */
export function getSupabase(session: Session | null): SupabaseClient {
  const token = session?.token ?? null
  if (client && token === currentToken) return client
  currentToken = token
  client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  })
  if (token) client.realtime.setAuth(token)
  return client
}

export function resetSupabase() {
  client?.removeAllChannels()
  client = null
  currentToken = null
}
