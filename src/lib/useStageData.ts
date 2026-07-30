import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'
import { liveChannel } from './realtime'
import { fetchCards, fetchDotCounts, fetchMyUsage, type Card } from './anon'

export interface StageData {
  cards: Card[]
  dots: Record<string, number>
  myCards: number
  myDots: number
  reload: () => void
}

/**
 * Live cards + dot tallies for a stage, plus the caller's own ledger usage.
 * Re-fetches on any realtime change to cards/votes (small data, 10 people — a
 * refetch is simpler and less bug-prone than patching local state).
 */
export function useStageData(stageId: string | null): StageData {
  const { member } = useAuth()
  const [cards, setCards] = useState<Card[]>([])
  const [dots, setDots] = useState<Record<string, number>>({})
  const [myCards, setMyCards] = useState(0)
  const [myDots, setMyDots] = useState(0)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!member || !stageId) {
      setCards([])
      setDots({})
      return
    }
    let cancelled = false

    async function load() {
      const [c, d, uc, ud] = await Promise.all([
        fetchCards(supabase, stageId!),
        fetchDotCounts(supabase, stageId!),
        fetchMyUsage(supabase, stageId!, 'card'),
        fetchMyUsage(supabase, stageId!, 'dot'),
      ])
      if (cancelled) return
      setCards(c)
      setDots(d)
      setMyCards(uc)
      setMyDots(ud)
    }
    load()
    // `stages` is bound deliberately. cards_select hides every card while the
    // stage is 'open' under the default batch reveal, and opens them the instant
    // stages.state flips. Without a binding on `stages` nothing tells the client
    // that moment arrived: the host's screen fills and every passenger keeps
    // staring at an empty board until they happen to reload.
    const channel = liveChannel(`stage-${stageId}`, ['cards', 'votes', 'stages'], load)

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stageId, tick])

  return { cards, dots, myCards, myDots, reload }
}
