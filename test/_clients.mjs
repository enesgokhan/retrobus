// Shared test client factory.
//
// Supabase rate-limits anonymous sign-ins per IP (30/hour by default), and a
// suite that signs in fresh every run exhausts that in minutes — which is how
// this file came to exist. Sessions are cached on disk and reused; a new
// anonymous user is only created when there is no usable cached session.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const URL = 'https://mxskxexxyazddcdusnvz.supabase.co'
export const KEY = 'sb_publishable_EdAjymtekBQR6Hg6vtjpPg_1Gd6E4Ge'
export const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'

const CACHE = join(dirname(fileURLToPath(import.meta.url)), '.sessions.json')

function loadCache() {
  if (!existsSync(CACHE)) return {}
  try {
    return JSON.parse(readFileSync(CACHE, 'utf8'))
  } catch {
    return {}
  }
}

function saveCache(cache) {
  writeFileSync(CACHE, JSON.stringify(cache, null, 2))
}

/**
 * A signed-in anonymous client under a stable `slot` name, reusing the cached
 * session when possible. Call `claim` afterwards to bind it to a member.
 */
export async function client(slot) {
  const cache = loadCache()
  const sb = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const saved = cache[slot]
  if (saved?.refresh_token) {
    const { data, error } = await sb.auth.setSession({
      access_token: saved.access_token,
      refresh_token: saved.refresh_token,
    })
    if (!error && data.session) {
      // Access tokens last an hour. A cached one is usually stale, and an
      // expired JWT makes Realtime reject the socket outright (status=CLOSED,
      // no events) — which cost real debugging time to work out. Refresh when
      // it is expired or close to it, and push the new token to Realtime.
      const expSoon = (data.session.expires_at ?? 0) * 1000 < Date.now() + 5 * 60_000
      let session = data.session
      if (expSoon) {
        const refreshed = await sb.auth.refreshSession()
        if (refreshed.error || !refreshed.data.session) {
          // fall through to a fresh anonymous sign-in below
          delete cache[slot]
          saveCache(cache)
          session = null
        } else {
          session = refreshed.data.session
        }
      }
      if (session) {
        sb.realtime.setAuth(session.access_token)
        cache[slot] = {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }
        saveCache(cache)
        return sb
      }
    }
  }

  // Retry a rate-limited sign-in rather than failing the whole suite: several
  // clients starting together is normal here, just as ten people arriving
  // together is normal on the night.
  let data, error
  for (let attempt = 0; attempt < 5; attempt++) {
    ;({ data, error } = await sb.auth.signInAnonymously())
    if (!error || error.status !== 429) break
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 500))
  }
  if (error) {
    if (error.status === 429) {
      console.error(
        '\nAnonymous sign-in is rate limited (429). Cached sessions in\n' +
          'test/.sessions.json normally avoid this — if you have just deleted\n' +
          'anonymous auth users, you invalidated those caches and every suite\n' +
          'now has to sign up again. Wait for the window to roll over, or raise\n' +
          'the limit in Supabase: Authentication -> Rate Limits.\n',
      )
    }
    throw new Error(`signInAnonymously failed: ${error.message}`)
  }
  sb.realtime.setAuth(data.session.access_token)
  cache[slot] = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  }
  saveCache(cache)
  return sb
}

/** Binds a client to a member via claim_member, throwing on failure. */
export async function claim(sb, name, code) {
  const { data, error } = await sb.rpc('claim_member', { p_name: name, p_code: code })
  if (error) throw new Error(`claim_member(${name}) errored: ${error.message}`)
  if (!data?.ok) throw new Error(`claim_member(${name}) refused: ${JSON.stringify(data)}`)
  return data
}

/** Host client, bound to Enes. */
export async function hostClient() {
  const sb = await client('host')
  await claim(sb, 'Enes', HOST_CODE)
  return sb
}

/**
 * Creates (or reuses) N test members with codes and returns bound clients.
 * Members are named Test1..TestN so they never collide with real people.
 */
export async function testMembers(host, count) {
  const names = Array.from({ length: count }, (_, i) => `Test${i + 1}`)
  const codes = names.map((_, i) => String(100000 + i * 111111).slice(0, 6))

  for (const n of names) {
    await host.from('members').insert({ display_name: n })
  }
  const { data: roster } = await host.from('members').select('id, display_name')
  const idOf = (n) => roster.find((r) => r.display_name === n)?.id
  for (let i = 0; i < names.length; i++) {
    await host.rpc('set_member_code', { p_member_id: idOf(names[i]), p_code: codes[i] })
  }

  const clients = {}
  for (let i = 0; i < names.length; i++) {
    const sb = await client(`member${i + 1}`)
    await claim(sb, names[i], codes[i])
    clients[names[i]] = sb
  }
  return { names, clients, idOf, roster }
}

/** Removes test members and every meeting created by a test. */
export async function cleanup(host, names) {
  for (const n of names) {
    await host.from('members').delete().eq('display_name', n)
  }
}
