import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Subscribes to postgres_changes on `tables` and calls `onChange` for each one.
 *
 * Also calls `onChange` every time the channel reports SUBSCRIBED. That is not
 * belt-and-braces, it is load-bearing:
 *
 *   1. A subscription is not receiving changes the instant `subscribe()` is
 *      called — anything written between our initial fetch and the channel
 *      going live would be missed with no later event to correct it. On a
 *      host-driven meeting that means a passenger stuck on the previous stage.
 *   2. After a network drop, supabase-js rejoins and reports SUBSCRIBED again,
 *      so this doubles as reconnect recovery — phones sleeping and wifi
 *      dropping over three hours is a certainty, not an edge case.
 *
 * `onChange` must therefore be idempotent (a full refetch, not a patch).
 */
export function liveChannel(name: string, tables: string[], onChange: () => void): RealtimeChannel {
  let channel = supabase.channel(name)
  for (const table of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
  }
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') onChange()
  })
  return channel
}
