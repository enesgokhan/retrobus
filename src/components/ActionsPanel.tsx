import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Button from './ui/Button'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import type { Member } from '../lib/types'

export interface ActionItem {
  id: string
  meeting_id: string
  source_card_id: string | null
  body: string
  owner_member_id: string | null
  done: boolean
}

/**
 * Kararlar — tartışmadan çıkan, sahibi olan taahhütler.
 * Kartların aksine bunlar bilerek anonim DEĞİL: sahiplik işin bütün amacı.
 */
export default function ActionsPanel({ meetingId }: { meetingId: string }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const [actions, setActions] = useState<ActionItem[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: a }, { data: m }] = await Promise.all([
        supabase
          .from('actions')
          .select('id, meeting_id, source_card_id, body, owner_member_id, done')
          .eq('meeting_id', meetingId)
          .order('created_at'),
        supabase.from('members').select('id, display_name, is_host').order('display_name'),
      ])
      if (cancelled) return
      setActions((a as ActionItem[]) ?? [])
      setMembers((m as Member[]) ?? [])
    }
    load()
    const channel = liveChannel(`actions-${meetingId}`, ['actions'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [meetingId])

  async function add() {
    const body = draft.trim()
    if (!body) return
    await supabase.from('actions').insert({ meeting_id: meetingId, body })
    setDraft('')
  }

  async function setOwner(id: string, owner_member_id: string | null) {
    await supabase.from('actions').update({ owner_member_id }).eq('id', id)
  }

  async function toggleDone(id: string, done: boolean) {
    await supabase.from('actions').update({ done }).eq('id', id)
  }

  async function remove(id: string) {
    await supabase.from('actions').delete().eq('id', id)
  }

  if (!actions.length && !isHost) return null

  return (
    <section className="card-lg w-full max-w-3xl flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="text-overline uppercase text-label-3">Kararlar</h3>
        {actions.length > 0 && <span className="badge nums">{actions.length}</span>}
      </div>

      {actions.length === 0 ? (
        <p className="text-subhead text-label-3">Henüz karar yok. Konuşurken buraya ekle.</p>
      ) : (
        <ul className="list-group">
          {actions.map((a) => (
            <li key={a.id} className="list-row items-start py-3">
              <input
                type="checkbox"
                className="mt-1 size-5 accent-[var(--tint)] shrink-0"
                checked={a.done}
                disabled={!isHost}
                onChange={(e) => toggleDone(a.id, e.target.checked)}
                aria-label="Tamamlandı"
              />
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <span className={['text-body', a.done ? 'line-through text-label-3' : ''].join(' ')}>
                  {a.body}
                </span>
                {isHost ? (
                  <select
                    className="field py-1.5 max-w-52 text-subhead min-h-9"
                    value={a.owner_member_id ?? ''}
                    aria-label="Sahibi"
                    onChange={(e) => setOwner(a.id, e.target.value || null)}
                  >
                    <option value="">— sahibi yok —</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-footnote text-label-3">
                    {a.owner_member_id
                      ? members.find((m) => m.id === a.owner_member_id)?.display_name ?? 'sahibi yok'
                      : 'sahibi yok'}
                  </span>
                )}
              </div>
              {isHost && (
                <button className="btn-plain btn-sm !text-label-3 shrink-0" onClick={() => remove(a.id)}>
                  Sil
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isHost && (
        <div className="flex items-center gap-2">
          <input
            className="field flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Yeni karar…"
            aria-label="Yeni karar"
            maxLength={500}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button variant="filled" onClick={add} disabled={!draft.trim()}>
            Ekle
          </Button>
        </div>
      )}
    </section>
  )
}
