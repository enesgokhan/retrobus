import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** False until VITE_SUPABASE_* are wired up (fresh deploy, missing .env.local). */
export const IS_CONFIGURED = Boolean(url && anonKey)

/**
 * One client for the whole app. Supabase owns the session: anonymous sign-in
 * provides the token, supabase-js persists and refreshes it, and Realtime picks
 * up auth changes on its own. Identity beyond "some anonymous user" comes from
 * member_links, resolved server-side by the RLS helpers (see migration 0001).
 */
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'retrobus.auth',
  },
})
