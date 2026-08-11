import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { liveChannel } from './realtime'
import { useAuth } from './auth'

export interface Progress {
  /** how many people have done this action on this stage */
  done: number
  /** how many people have logged in at all */
  total: number
}

/**
 * "7/9 yazdı" — so the host knows when to move on instead of guessing.
 *
 * Counts only: `participation` itself stays private per person (see 0010), and a
 * number reveals no identities. Without this the host has to keep asking "herkes
 * yazdı mı?", which is exactly the friction the app should remove.
 */
export function useProgress(stageId: string | null, actionKey: string): Progress {
  const { member } = useAuth()
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0 })

  useEffect(() => {
    if (!member || !stageId) {
      setProgress({ done: 0, total: 0 })
      return
    }
    let cancelled = false

    async function load() {
      const [{ data: done }, { data: total }] = await Promise.all([
        supabase.rpc('stage_progress', { p_stage_id: stageId, p_action_key: actionKey }),
        supabase.rpc('active_member_count'),
      ])
      if (cancelled) return
      setProgress({ done: (done as number) ?? 0, total: (total as number) ?? 0 })
    }
    load()
    const channel = liveChannel(`progress-${stageId}-${actionKey}`, ['participation'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stageId, actionKey])

  return progress
}

/**
 * The same count, for several action keys at once.
 *
 * The health check asks six questions and the shared screen had nothing to show
 * while the room answered them: in presenter mode the controls are hidden — as
 * they must be, nobody votes on the projector — and what was left was six
 * labels and no other mark on the page. Three minutes of a three-hour meeting,
 * projected to everyone, saying nothing.
 *
 * `stage_progress` counts distinct members per key and returns a number, so
 * asking it six times says how far the room has got without exposing a single
 * rating — which is the whole point of the batch reveal and must survive this.
 */
export function useProgressMany(
  stageId: string | null,
  actionKeys: string[],
): { done: Record<string, number>; total: number } {
  const { member } = useAuth()
  const [state, setState] = useState<{ done: Record<string, number>; total: number }>({
    done: {},
    total: 0,
  })
  // the array identity changes every render; its contents do not
  const keyList = actionKeys.join(',')

  useEffect(() => {
    const keys = keyList ? keyList.split(',') : []
    if (!member || !stageId || !keys.length) {
      setState({ done: {}, total: 0 })
      return
    }
    let cancelled = false

    async function load() {
      const [counts, { data: total }] = await Promise.all([
        Promise.all(
          keys.map((k) =>
            supabase.rpc('stage_progress', { p_stage_id: stageId, p_action_key: k }),
          ),
        ),
        supabase.rpc('active_member_count'),
      ])
      if (cancelled) return
      const done: Record<string, number> = {}
      keys.forEach((k, i) => {
        done[k] = (counts[i].data as number) ?? 0
      })
      setState({ done, total: (total as number) ?? 0 })
    }
    load()
    const channel = liveChannel(`progress-many-${stageId}`, ['participation'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stageId, keyList])

  return state
}
