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
 *
 * Two Realtime behaviours verified empirically against this project, because
 * both are easy to get wrong and neither is obvious:
 *
 *   - A binding on a table that is NOT in the supabase_realtime publication
 *     silently kills EVERY OTHER binding on the same channel, while the channel
 *     still reports SUBSCRIBED. This caused a real "data doesn't load until
 *     refresh" bug. test/publication-test.mjs now guards against it.
 *   - Realtime DOES respect column-level grants: a payload omits columns the
 *     subscriber has no SELECT privilege on (proven with
 *     fibbage_lies.author_member_id), and such a binding does not poison its
 *     siblings. So a revoked column stays secret over the websocket too — but
 *     never publish a table whose secret matters, since that is one policy
 *     change away from being wrong.
 *
 * Because delivery of any individual event is not guaranteed to be prompt, this
 * helper never relies on a specific event: every signal triggers a full refetch.
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
