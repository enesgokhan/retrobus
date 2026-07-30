import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

const HEARTBEAT_MS = 20000
const WINDOW_S = 60

/**
 * Kim odada — websocket olmadan da çalışan sürümü.
 *
 * ÖNCEKİ HATA: küme yalnızca Realtime presence'ten kuruluyordu. Websocket
 * kurulamayan bir ağda (kurumsal proxy upgrade'i reddediyor — uygulamanın
 * yazarının kendi ağı) küme boş kalıyor ve konsol "0/1 odada" yazıyordu; oysa
 * bakan kişi tanım gereği odadaydı. Kimse kullanıcıyı kendi listesine eklemiyordu.
 *
 * Şimdi üç kaynağın birleşimi:
 *   1. KENDİN — her zaman, koşulsuz. Bu ekrana bakıyorsan odadasın.
 *   2. Realtime presence — varsa anında.
 *   3. Veritabanı nabzı — düz HTTP üzerinden, realtime hiç çalışmasa bile.
 */
export function usePresence(meetingId: string | null): Set<string> {
  const { member } = useAuth()
  const [wsHere, setWsHere] = useState<Set<string>>(new Set())
  const [dbHere, setDbHere] = useState<Set<string>>(new Set())

  // --- 1 + 2: realtime presence, when the socket can be established ---
  useEffect(() => {
    if (!member || !meetingId) {
      setWsHere(new Set())
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
      setWsHere(ids)
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

  // --- 3: heartbeat + poll, which works with realtime entirely unavailable ---
  useEffect(() => {
    if (!member) {
      setDbHere(new Set())
      return
    }
    let cancelled = false

    async function beat() {
      if (cancelled) return
      // don't claim to be present in a tab nobody is looking at
      if (!document.hidden) await supabase.rpc('touch_presence')
      const { data } = await supabase.rpc('present_members', { p_within_seconds: WINDOW_S })
      if (cancelled) return
      const ids = new Set<string>(((data as { member_id: string }[]) ?? []).map((r) => r.member_id))
      setDbHere(ids)
    }

    beat()
    const t = setInterval(beat, HEARTBEAT_MS)
    const onVisible = () => {
      if (!document.hidden) void beat()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [member])

  // union of all three; self is unconditional
  const here = new Set<string>([...wsHere, ...dbHere])
  if (member) here.add(member.id)
  return here
}
