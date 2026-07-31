// Browser contexts that do not spend a new anonymous sign-in on every run.
//
// Supabase rate-limits anonymous sign-ups, and every fresh Playwright context
// is a brand new anonymous user. Running the browser suites a few times in an
// hour exhausts the quota — which does not just fail the tests, it locks the
// real host out of the real app until the window rolls over. That is a bad
// thing for a test suite to be able to do to production.
//
// So each persona keeps its storage state on disk and reuses it. First run pays
// for the sign-in; every run after that costs nothing.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '.sessions')
mkdirSync(DIR, { recursive: true })

const fileFor = (persona) => join(DIR, `${persona.replace(/[^a-z0-9_-]/gi, '_')}.json`)

/**
 * A context for `persona`, restoring their stored session if we have one.
 * Pass the same persona name across runs to reuse the same anonymous user.
 */
const live = new Map()

export async function personaContext(browser, persona, opts = {}) {
  const path = fileFor(persona)
  const storageState = existsSync(path) ? path : undefined
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: 'tr-TR',
    storageState,
    ...opts,
  })
  live.set(ctx, persona)
  return ctx
}

/**
 * Save every context this run opened. Call once before closing the browser —
 * that is late enough for the sign-ins to have happened and early enough that
 * the contexts still exist.
 */
export async function saveAllSessions() {
  for (const [ctx, persona] of live) await rememberSession(ctx, persona)
  live.clear()
}

/** Save the session so the next run does not have to sign up again. */
export async function rememberSession(ctx, persona) {
  try {
    const state = await ctx.storageState()
    writeFileSync(fileFor(persona), JSON.stringify(state))
  } catch {
    /* a failed save just means the next run pays for a sign-in */
  }
}

/** Forget a persona — use when their member row is deleted and recreated. */
export function forgetSession(persona) {
  try {
    writeFileSync(fileFor(persona), JSON.stringify({ cookies: [], origins: [] }))
  } catch {
    /* nothing to do */
  }
}
