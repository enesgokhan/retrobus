import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { liveChannel } from './realtime'
import { useAuth } from './auth'
import type { Stage } from './types'

export interface Readiness {
  /** false when the stage needs host setup before it can be run */
  ready: boolean
  /** what the host has to do, in Turkish, or null when ready */
  todo: string | null
}

/**
 * Which stages need host setup before they will work, and what is missing.
 *
 * This exists because "the games weren't set up" is an easy failure to walk
 * into: a quiz stage with no questions, or a Fibbage stage with no round, looks
 * identical to a broken app from the room's side. The host console surfaces this
 * per stage instead of leaving it buried in a collapsed settings panel.
 */
export function useStageReadiness(stages: Stage[]): Record<string, Readiness> {
  const { member } = useAuth()
  const [state, setState] = useState<Record<string, Readiness>>({})

  const relevant = stages.filter((s) =>
    ['quiz', 'fibbage', 'rank', 'codenames', 'wavelength', 'secret_mission'].includes(s.kind),
  )
  const key = relevant.map((s) => `${s.id}:${s.kind}`).join(',')

  useEffect(() => {
    if (!member || !relevant.length) {
      setState({})
      return
    }
    let cancelled = false

    async function load() {
      const next: Record<string, Readiness> = {}
      const quizIds = relevant.filter((s) => s.kind === 'quiz').map((s) => s.id)
      const fibIds = relevant.filter((s) => s.kind === 'fibbage').map((s) => s.id)
      const rankIds = relevant.filter((s) => s.kind === 'rank').map((s) => s.id)
      const cnIds = relevant.filter((s) => s.kind === 'codenames').map((s) => s.id)
      const meetingIds = [...new Set(relevant.map((s) => s.meeting_id))]

      const [quiz, fib, rank, cn, missions] = await Promise.all([
        quizIds.length
          ? supabase.from('quiz_questions').select('stage_id').in('stage_id', quizIds)
          : Promise.resolve({ data: [] }),
        fibIds.length
          ? supabase.from('fibbage_rounds').select('stage_id').in('stage_id', fibIds)
          : Promise.resolve({ data: [] }),
        rankIds.length
          ? supabase.from('rank_items').select('stage_id').in('stage_id', rankIds)
          : Promise.resolve({ data: [] }),
        cnIds.length
          ? supabase.from('cn_games').select('stage_id, phase').in('stage_id', cnIds)
          : Promise.resolve({ data: [] }),
        meetingIds.length
          ? supabase.from('missions').select('meeting_id').in('meeting_id', meetingIds)
          : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return

      const count = (rows: { stage_id: string }[] | null, id: string) =>
        (rows ?? []).filter((r) => r.stage_id === id).length

      for (const s of relevant) {
        if (s.kind === 'quiz') {
          const n = count(quiz.data as { stage_id: string }[], s.id)
          next[s.id] = n
            ? { ready: true, todo: null }
            : { ready: false, todo: 'Soru ekle (Durak ayarları → Quiz soruları)' }
        } else if (s.kind === 'fibbage') {
          const n = count(fib.data as { stage_id: string }[], s.id)
          next[s.id] = n
            ? { ready: true, todo: null }
            : { ready: false, todo: 'Tur ekle (soru + gerçek cevap)' }
        } else if (s.kind === 'rank') {
          const n = count(rank.data as { stage_id: string }[], s.id)
          next[s.id] = n >= 3
            ? { ready: true, todo: null }
            : { ready: false, todo: `Sıralanacak öğe ekle (en az 3, şu an ${n})` }
        } else if (s.kind === 'codenames') {
          const games = (cn.data as { stage_id: string; phase: string }[] | null) ?? []
          const mine = games.filter((g) => g.stage_id === s.id)
          next[s.id] = mine.length
            ? mine.some((g) => g.phase === 'playing' || g.phase === 'done')
              ? { ready: true, todo: null }
              : { ready: false, todo: 'Takımlar seçilince tahtayı dağıt' }
            : { ready: false, todo: 'Oyun kur' }
        } else if (s.kind === 'wavelength') {
          // needs no pre-setup: the host starts a round live
          next[s.id] = { ready: true, todo: null }
        } else if (s.kind === 'secret_mission') {
          const n = ((missions.data as { meeting_id: string }[] | null) ?? []).filter(
            (r) => r.meeting_id === s.meeting_id,
          ).length
          next[s.id] = n
            ? { ready: true, todo: null }
            : { ready: false, todo: 'Görevleri dağıt — toplantının BAŞINDA yap' }
        }
      }
      setState(next)
    }

    load()
    const channel = liveChannel(
      'stage-readiness',
      ['quiz_questions', 'fibbage_rounds', 'rank_items', 'cn_games', 'missions'],
      load,
    )
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the stable
    // `key` string; `relevant` is a fresh array on every render.
  }, [member, key])

  return state
}
