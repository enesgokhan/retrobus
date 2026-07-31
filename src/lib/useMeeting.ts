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
  /**
   * True when there is no live meeting but the most recent one was archived —
   * i.e. the evening is over rather than not yet begun. Without this the room
   * falls back to "the bus is about to leave" at the exact moment the host
   * ends the night, which reads as the app losing its place.
   */
  ended: boolean
}

/**
 * Subscribes to the live meeting (or a specific one) plus its stages.
 * Every client — yolcu, şoför, sunum — runs on this hook; when the host changes
 * active_stage_id or a stage's state, everyone follows in realtime.
 */
export function useMeeting(meetingId?: string, opts?: { includeArchived?: boolean }): MeetingLive {
  const { member } = useAuth()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [ended, setEnded] = useState(false)
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!member) return
    let cancelled = false

    async function load() {
      const q = supabase.from('meetings').select('*')
      // The room follows the LIVE meeting only — once the night is archived
      // passengers should not be dropped back into it. The yearbook is the
      // exception: it is the keepsake, and it has to survive the meeting ending.
      const scoped = opts?.includeArchived ? q : q.eq('status', 'live')
      const { data: m, error: mErr } = meetingId
        ? await q.eq('id', meetingId).maybeSingle()
        : await scoped
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
      if (cancelled) return

      // A failed READ is not the same as "there is no meeting". Four seconds of
      // bad connectivity used to empty the room: the stage unmounted, whatever
      // someone was typing was destroyed, and they were dropped onto the
      // "waiting for the driver" screen mid-sentence. Keep what we had and try
      // again on the next tick; the polling fallback guarantees there is one.
      if (mErr) {
        if (!cancelled) setLoading(false)
        return
      }
      setMeeting((m as Meeting) ?? null)
      if (!m && !meetingId) {
        // nothing live: has this room already had its evening?
        const { data: last } = await supabase
          .from('meetings')
          .select('status')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!cancelled) setEnded((last as { status?: string } | null)?.status === 'done')
      } else if (!cancelled) setEnded(false)
      if (m) {
        const { data: st, error: sErr } = await supabase
          .from('stages')
          .select('*')
          .eq('meeting_id', (m as Meeting).id)
          .order('order_index')
        // same rule: a failed read must not wipe the route out from under the
        // host mid-evening
        if (!cancelled && !sErr) setStages((st as Stage[]) ?? [])
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

  return { meeting, stages, activeStage, loading, ended }
}
