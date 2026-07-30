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
