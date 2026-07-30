import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import { MISSIONS_TR } from '../content/tr/missions'
import { fireConfetti } from '../lib/celebrate'
import type { Member, Stage } from '../lib/types'

interface Mission {
  id: string
  member_id: string
  body: string
  completed: boolean | null
  revealed: boolean
}

/**
 * Gizli Görev.
 * Görevler toplantının BAŞINDA dağıtılır ve arka planda çalışır; bu durak
 * finalde açılır. Kimsenin görevi kimseye görünmez — şoföre bile, çünkü havuzu
 * o yazdı ve kimin ne aldığını bilse insanları farkında olmadan yönlendirir.
 */
export default function MissionStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const [missions, setMissions] = useState<Mission[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [didCelebrate, setDidCelebrate] = useState(false)

  const anyRevealed = missions.some((m) => m.revealed)

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      const [{ data: ms }, { data: mem }] = await Promise.all([
        supabase
          .from('missions')
          .select('id, member_id, body, completed, revealed')
          .eq('meeting_id', stage.meeting_id),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
      ])
      if (cancelled) return
      setMissions((ms as Mission[]) ?? [])
      setMembers((mem as Member[]) ?? [])
    }
    load()
    const channel = liveChannel(`missions-${stage.meeting_id}`, ['missions'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.meeting_id])

  useEffect(() => {
    if (anyRevealed && !didCelebrate) {
      setDidCelebrate(true)
      fireConfetti()
    }
  }, [anyRevealed, didCelebrate])

  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—'
  const avatarOf = (id: string) => members.find((m) => m.id === id)?.avatar || '🙂'
  const mine = missions.find((m) => m.member_id === member?.id) ?? null

  async function assign() {
    setNote(null)
    const { data, error } = await supabase.rpc('assign_missions', {
      p_meeting_id: stage.meeting_id,
      p_pool: MISSIONS_TR,
    })
    setNote(error ? 'Dağıtılamadı.' : `${data} kişiye görev verildi.`)
  }

  async function reveal() {
    setNote(null)
    const { error } = await supabase.rpc('reveal_missions', { p_meeting_id: stage.meeting_id })
    if (error) setNote('Açılamadı.')
  }

  async function toggleDone(id: string, completed: boolean) {
    await supabase.from('missions').update({ completed }).eq('id', id)
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      {note && <p className="rounded-2xl bg-teal-soft px-4 py-2.5 text-sm font-semibold">{note}</p>}

      {!anyRevealed ? (
        <>
          {mine ? (
            <section className="card flex flex-col gap-2 border-grape bg-grape-soft">
              <span className="text-xs font-bold uppercase tracking-widest text-grape">
                🕶️ Gizli görevin — kimseye söyleme
              </span>
              <p className={presenter ? 'text-3xl font-extrabold' : 'text-xl font-extrabold'}>{mine.body}</p>
              <p className="text-xs font-semibold text-ink-soft">
                Toplantı boyunca fırsat kolla. Finalde herkesin görevi açılacak.
              </p>
            </section>
          ) : (
            <p className="text-center text-ink-soft">
              {isHost ? 'Görevler henüz dağıtılmadı.' : 'Sana görev atanmamış.'}
            </p>
          )}
          {isHost && !presenter && (
            <section className="card flex flex-col gap-2">
              <h4 className="font-bold text-sm">Şoför</h4>
              <p className="text-xs text-ink-soft">
                Görevleri toplantının BAŞINDA dağıt, bu durağı finale koy. Kimin hangi görevi aldığını
                sen de göremezsin — bilseydin farkında olmadan yönlendirirdin.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button className="btn-coral text-sm" onClick={assign}>
                  🎲 Görevleri dağıt ({missions.length || 0} atanmış)
                </button>
                {missions.length > 0 && (
                  <button className="btn-ghost text-sm" onClick={reveal}>
                    🎭 Hepsini aç (final)
                  </button>
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <h3 className={['text-center font-extrabold', presenter ? 'text-4xl' : 'text-2xl'].join(' ')}>
            🕶️ Gizli görevler
          </h3>
          <div className="flex flex-col gap-2">
            {missions.map((m) => (
              <div
                key={m.id}
                className={[
                  'card flex items-start gap-3 py-3',
                  m.completed === true ? 'border-teal bg-teal-soft' : '',
                  m.completed === false ? 'opacity-60' : '',
                ].join(' ')}
              >
                <span className={presenter ? 'text-3xl' : 'text-2xl'} aria-hidden>
                  {avatarOf(m.member_id)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold">{nameOf(m.member_id)}</div>
                  <p className={presenter ? 'text-xl' : ''}>{m.body}</p>
                </div>
                {isHost && !presenter ? (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      className={[
                        'rounded-full px-2.5 py-1 text-xs font-bold border-2',
                        m.completed === true ? 'bg-teal text-white border-teal' : 'border-line',
                      ].join(' ')}
                      onClick={() => toggleDone(m.id, true)}
                    >
                      başardı
                    </button>
                    <button
                      className={[
                        'rounded-full px-2.5 py-1 text-xs font-bold border-2',
                        m.completed === false ? 'bg-ink text-white border-ink' : 'border-line',
                      ].join(' ')}
                      onClick={() => toggleDone(m.id, false)}
                    >
                      olmadı
                    </button>
                  </div>
                ) : (
                  <span className="shrink-0 text-2xl" aria-hidden>
                    {m.completed === true ? '✅' : m.completed === false ? '❌' : '❓'}
                  </span>
                )}
              </div>
            ))}
          </div>
          {isHost && !presenter && (
            <button className="btn-coral self-center" onClick={reveal}>
              Başarılanları puanla (+800)
            </button>
          )}
        </>
      )}
    </div>
  )
}
