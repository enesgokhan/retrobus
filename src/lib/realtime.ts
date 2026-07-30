import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** How the app is currently receiving updates. */
export type LiveMode = 'live' | 'polling'

interface Entry {
  mode: LiveMode
  /** ms timestamp of the last successful onChange() */
  lastOk: number
}

const registry = new Map<string, Entry>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Subscribe to connection-health changes (used by ConnStatus and /tani). */
export function onLiveStatusChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export interface LiveStatus {
  mode: LiveMode
  /** ms since the most recent successful refetch across all channels */
  staleMs: number
  channels: { name: string; mode: LiveMode; ageMs: number }[]
}

/** Current health, derived from what the channels have actually reported. */
export function liveStatus(): LiveStatus {
  const now = Date.now()
  const rows = [...registry.entries()].map(([name, e]) => ({
    name,
    mode: e.mode,
    ageMs: now - e.lastOk,
  }))
  if (!rows.length) return { mode: 'live', staleMs: 0, channels: [] }
  // if any channel is polling, the app as a whole is in polling mode
  const mode: LiveMode = rows.some((r) => r.mode === 'polling') ? 'polling' : 'live'
  // the freshest successful fetch is the honest measure of "are we current?"
  const staleMs = Math.min(...rows.map((r) => r.ageMs))
  return { mode, staleMs, channels: rows }
}

const SUBSCRIBE_GRACE_MS = 6000
const POLL_MS = 4000
const HIDDEN_POLL_MS = 15000

/**
 * Subscribes to postgres_changes on `tables`, calling `onChange` for each one —
 * and falls back to polling when the WebSocket cannot be established.
 *
 * WHY THE FALLBACK EXISTS: corporate proxies routinely refuse or mangle the
 * HTTP->WebSocket upgrade. On such a network the socket never joins, so with a
 * pure-realtime design NOTHING on any screen ever updates: every stage sits
 * frozen until a manual reload, while the host drives on without them. That is
 * the difference between this app working and not working, and it is the network
 * its own author is on. So realtime is treated as an optimisation, never a
 * requirement.
 *
 * `onChange` must be idempotent (a full refetch, not a patch) — it is called from
 * three directions: postgres_changes events, every SUBSCRIBED, and the poll.
 *
 * Also relevant, both verified against this project:
 *   - A binding on a table that is NOT in the supabase_realtime publication
 *     silently kills EVERY OTHER binding on the same channel while still
 *     reporting SUBSCRIBED. test/publication-test.mjs guards that.
 *   - Realtime does respect column-level grants: payloads omit columns the
 *     subscriber cannot SELECT. Still never publish a table whose secret matters.
 */
export function liveChannel(name: string, tables: string[], onChange: () => void): RealtimeChannel {
  let disposed = false
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let graceTimer: ReturnType<typeof setTimeout> | null = null

  registry.set(name, { mode: 'live', lastOk: Date.now() })

  /** Run onChange and record that we successfully refreshed. */
  const refresh = () => {
    if (disposed) return
    try {
      onChange()
      const e = registry.get(name)
      if (e) e.lastOk = Date.now()
      notify()
    } catch {
      /* a failed refetch is reported through staleness, not thrown */
    }
  }

  function setMode(mode: LiveMode) {
    const e = registry.get(name)
    if (!e || e.mode === mode) return
    e.mode = mode
    notify()
  }

  function startPolling() {
    if (disposed || pollTimer) return
    setMode('polling')
    const tick = () => {
      // back off in a hidden tab so eight backgrounded windows do not all poll
      // at full rate; the tab refreshes as soon as it is looked at again
      if (document.hidden) return
      refresh()
    }
    tick()
    pollTimer = setInterval(tick, POLL_MS)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    setMode('live')
  }

  // A hidden tab that becomes visible should catch up immediately rather than
  // waiting out the interval.
  const onVisible = () => {
    if (!document.hidden && pollTimer) refresh()
  }
  document.addEventListener('visibilitychange', onVisible)

  let channel = supabase.channel(name)
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => refresh())
  }

  channel.subscribe((status) => {
    if (disposed) return
    if (status === 'SUBSCRIBED') {
      // Refetch on every SUBSCRIBED, not only the first: anything written
      // between our initial fetch and the channel going live would otherwise be
      // missed with no later event to correct it, and this doubles as recovery
      // after a reconnect.
      if (graceTimer) {
        clearTimeout(graceTimer)
        graceTimer = null
      }
      stopPolling()
      refresh()
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      startPolling()
    }
  })

  // If the socket never comes up at all, no status callback may arrive — so time
  // the join out ourselves rather than waiting forever.
  graceTimer = setTimeout(() => {
    graceTimer = null
    const joined = supabase.getChannels().some((c) => c.topic.endsWith(name) && c.state === 'joined')
    if (!joined) startPolling()
  }, SUBSCRIBE_GRACE_MS)

  // Patch removeChannel's cleanup path: callers already call supabase
  // .removeChannel(channel), so hook teardown onto the channel object itself.
  const originalUnsubscribe = channel.unsubscribe.bind(channel)
  channel.unsubscribe = async (...args: Parameters<typeof originalUnsubscribe>) => {
    disposed = true
    if (graceTimer) clearTimeout(graceTimer)
    if (pollTimer) clearInterval(pollTimer)
    document.removeEventListener('visibilitychange', onVisible)
    registry.delete(name)
    notify()
    return originalUnsubscribe(...args)
  }

  return channel
}

export { HIDDEN_POLL_MS, POLL_MS }
