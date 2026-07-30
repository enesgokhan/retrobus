import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { liveChannel } from './realtime'
import { useAuth } from './auth'

export interface LeaderRow {
  member_id: string
  display_name: string
  avatar: string | null
  points: number
}

/**
 * Meeting-wide standings, aggregated server-side (see the leaderboard() RPC).
 * Deliberately fetched but usually NOT displayed: the standings stay hidden
 * until the host reveals them, because the suspense is the point.
 */
export function useLeaderboard(meetingId: string | null): LeaderRow[] {
  const { member } = useAuth()
  const [rows, setRows] = useState<LeaderRow[]>([])

  useEffect(() => {
    if (!member || !meetingId) {
      setRows([])
      return
    }
    let cancelled = false
    async function load() {
      const { data } = await supabase.rpc('leaderboard', { p_meeting_id: meetingId })
      if (!cancelled) setRows((data as LeaderRow[]) ?? [])
    }
    load()
    const channel = liveChannel(`lb-${meetingId}`, ['scores'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, meetingId])

  return rows
}
