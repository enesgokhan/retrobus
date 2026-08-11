import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import { MISSIONS_TR } from '../content/tr/missions'
import { fireConfetti } from '../lib/celebrate'
import StageHeader from '../components/StageHeader'
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
  const [armed, setArmed] = useState(false)
  const [armedAt, setArmedAt] = useState(0)
  const [didCelebrate, setDidCelebrate] = useState(false)
  /** how many unrevealed missions exist in this meeting — a count, never a pairing */
  const [dealt, setDealt] = useState(0)

  const anyRevealed = missions.some((m) => m.revealed)

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      const [{ data: ms }, { data: mem }, { data: n }] = await Promise.all([
        supabase
          .from('missions')
          .select('id, member_id, body, completed, revealed')
          .eq('meeting_id', stage.meeting_id),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
        // How many are out there. `missions` itself returns at most YOUR row —
        // the host is not exempt from that policy, on purpose — so counting the
        // array told the host "0 atanmış" after a clean deal to nine people,
        // right next to a button that deletes and re-rolls the lot.
        supabase.rpc('mission_count', { p_meeting_id: stage.meeting_id }),
      ])
      if (cancelled) return
      setMissions((ms as Mission[]) ?? [])
      setMembers((mem as Member[]) ?? [])
      setDealt((n as number) ?? 0)
    }
    load()
    const channel = liveChannel(`missions-${stage.meeting_id}`, ['missions', 'stages'], load)
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
    <div className="w-full max-w-4xl flex-1 flex flex-col gap-4">
      <StageHeader
        phase={anyRevealed ? 'Görevler açıldı' : mine && !presenter ? 'Görev sende' : 'Gizli görevler'}
        instruction={
          anyRevealed ? 'Kim başardı, kim yakalandı?'
          : mine && !presenter ? 'Görevini kimseye söyleme. Fırsat kolla.'
          /* the shared screen is not the host's to-do list: this line used to
             tell the whole room to go and deal the missions */
          : presenter ? 'Herkes fırsat kolluyor. Finalde hepsi açılacak.'
          : isHost ? 'Görevleri dağıt — toplantının başında yap.'
          : 'Sana görev atanmamış.'
        }
        waiting={!anyRevealed && !mine}
        presenter={presenter}
      />
      {note && <p className="rounded-lg bg-teal-soft px-4 py-2.5 text-subhead font-semibold">{note}</p>}

      {!anyRevealed ? (
        <>
          {mine && !presenter ? (
            <section className="card flex flex-col gap-2 border-grape bg-grape-soft">
              <span className="eyebrow text-grape">
                Gizli görevin — kimseye söyleme
              </span>
              <p className={presenter ? 'text-title-1' : 'text-title-3'}>{mine.body}</p>
              <p className="text-footnote font-semibold text-label-2">
                Toplantı boyunca fırsat kolla. Finalde herkesin görevi açılacak.
              </p>
            </section>
          ) : presenter ? (
            /* The shared screen holds nobody's mission, so this branch is where
               it always lands — and it used to announce "Görevler henüz
               dağıtılmadı" to the whole room while everyone was holding one.
               The count is the one true thing this screen can say. */
            <p className="text-title-3 text-label-2 text-center">
              {dealt
                ? `${dealt} gizli görev dağıtıldı. Kimse söylemesin.`
                : 'Görevler henüz dağıtılmadı.'}
            </p>
          ) : (
            <p className="text-label-2">
              {isHost ? 'Görevler henüz dağıtılmadı.' : 'Sana görev atanmamış.'}
            </p>
          )}
          {isHost && !presenter && (
            <section className="card flex flex-col gap-2">
              <h4 className="font-bold text-subhead">Yönetim</h4>
              <p className="text-footnote text-label-2">
                Görevleri toplantının BAŞINDA dağıt, bu durağı finale koy. Kimin hangi görevi aldığını
                sen de göremezsin — bilseydin farkında olmadan yönlendirirdin.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  className={armed ? 'btn-filled text-subhead' : 'btn-gray text-subhead'}
                  onClick={() => {
                    // assign_missions deletes every unrevealed mission first, so
                    // pressing this at the finale silently re-rolls three hours
                    // of secret missions and loses the host's marks
                    if (!armed) { setArmed(true); setArmedAt(Date.now()); return }
                    if (Date.now() - armedAt < 700) return
                    setArmed(false)
                    void assign()
                  }}
                  onBlur={() => setArmed(false)}
                >
                  {armed
                    ? dealt
                      ? 'Mevcut görevler silinip yeniden dağıtılacak — bas'
                      : 'Dağıtmak için tekrar bas'
                    : `Görevleri dağıt (${dealt} atanmış)`}
                </button>
                {dealt > 0 && (
                  <button className="btn-gray text-subhead" onClick={reveal}>
                    Hepsini aç (final)
                  </button>
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <h3 className={['text-center', presenter ? 'text-display' : 'text-title-2'].join(' ')}>
            Gizli görevler
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
                  <div className="font-semibold">{nameOf(m.member_id)}</div>
                  <p className={presenter ? 'text-title-3' : ''}>{m.body}</p>
                </div>
                {isHost && !presenter ? (
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      className={[
                        'rounded-full px-2.5 py-1 text-footnote font-bold border-2',
                        m.completed === true ? 'bg-teal text-(--ink-on-teal) border-teal' : 'border-sep',
                      ].join(' ')}
                      onClick={() => toggleDone(m.id, true)}
                    >
                      başardı
                    </button>
                    <button
                      className={[
                        'rounded-full px-2.5 py-1 text-footnote font-bold border-2',
                        m.completed === false ? 'bg-fill text-label' : 'border-sep',
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
            <button className="btn-filled self-start" onClick={reveal}>
              Başarılanları puanla (+800)
            </button>
          )}
        </>
      )}
    </div>
  )
}
