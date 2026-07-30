import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth'
import { getSupabase } from './supabase'
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
 * Re-fetches on any realtime change to cards/votes (small data, 10 people —
 * a refetch is simpler and less bug-prone than patching local state).
 */
export function useStageData(stageId: string | null): StageData {
  const { session } = useAuth()
  const [cards, setCards] = useState<Card[]>([])
  const [dots, setDots] = useState<Record<string, number>>({})
  const [myCards, setMyCards] = useState(0)
  const [myDots, setMyDots] = useState(0)
  const [tick, setTick] = useState(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!session || !stageId) {
      setCards([])
      setDots({})
      return
    }
    const sb = getSupabase(session)
    let cancelled = false

    async function load() {
      const [c, d, uc, ud] = await Promise.all([
        fetchCards(sb, stageId!),
        fetchDotCounts(sb, stageId!),
        fetchMyUsage(sb, stageId!, 'card'),
        fetchMyUsage(sb, stageId!, 'dot'),
      ])
      if (cancelled) return
      setCards(c)
      setDots(d)
      setMyCards(uc)
      setMyDots(ud)
    }
    load()

    const channel = sb
      .channel(`stage-${stageId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => load())
      .subscribe()

    return () => {
      cancelled = true
      sb.removeChannel(channel)
    }
  }, [session, stageId, tick])

  return { cards, dots, myCards, myDots, reload }
}
