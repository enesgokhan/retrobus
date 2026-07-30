import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

/**
 * Who is actually in the room right now, via Realtime presence.
 *
 * A fully-remote three-hour meeting needs this: before starting, the host has to
 * know everybody is in, and when someone's phone drops out it should be visible
 * rather than mysterious. Presence is ephemeral and separate from the roster —
 * `members` is who was invited, this is who is here.
 */
export function usePresence(meetingId: string | null): Set<string> {
  const { member } = useAuth()
  const [here, setHere] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!member || !meetingId) {
      setHere(new Set())
      return
    }
    const channel = supabase.channel(`presence-${meetingId}`, {
      config: { presence: { key: member.id } },
    })

    const sync = () => {
      const state = channel.presenceState<{ member_id: string }>()
      const ids = new Set<string>()
      for (const entries of Object.values(state)) {
        for (const e of entries) if (e.member_id) ids.add(e.member_id)
      }
      setHere(ids)
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // re-track on every (re)subscribe so a reconnect restores our presence
          void channel.track({ member_id: member.id })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [member, meetingId])

  return here
}
