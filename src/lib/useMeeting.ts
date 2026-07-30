import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'
import { liveChannel } from './realtime'
import type { Meeting, Stage } from './types'

export interface MeetingLive {
  meeting: Meeting | null
  stages: Stage[]
  activeStage: Stage | null
  loading: boolean
}

/**
 * Subscribes to the live meeting (or a specific one) plus its stages.
 * Every client — yolcu, şoför, sunum — runs on this hook; when the host changes
 * active_stage_id or a stage's state, everyone follows in realtime.
 */
export function useMeeting(meetingId?: string): MeetingLive {
  const { member } = useAuth()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!member) return
    let cancelled = false

    async function load() {
      const q = supabase.from('meetings').select('*')
      const { data: m } = meetingId
        ? await q.eq('id', meetingId).maybeSingle()
        : await q
            .eq('status', 'live')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
      if (cancelled) return
      setMeeting((m as Meeting) ?? null)
      if (m) {
        const { data: st } = await supabase
          .from('stages')
          .select('*')
          .eq('meeting_id', (m as Meeting).id)
          .order('order_index')
        if (!cancelled) setStages((st as Stage[]) ?? [])
      } else {
        setStages([])
      }
      if (!cancelled) setLoading(false)
    }

    load()
    const channel = liveChannel('meeting-live', ['meetings', 'stages'], load)

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, meetingId])

  const activeStage = meeting?.active_stage_id
    ? (stages.find((s) => s.id === meeting.active_stage_id) ?? null)
    : null

  return { meeting, stages, activeStage, loading }
}
