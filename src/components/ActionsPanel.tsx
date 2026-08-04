import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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
    <section className="card w-full max-w-2xl flex flex-col gap-3">
      <h3 className="font-extrabold flex items-center gap-2">
        <span aria-hidden>✅</span> Kararlar
        {actions.length > 0 && <span className="text-ink-soft font-semibold">({actions.length})</span>}
      </h3>

      {actions.length === 0 ? (
        <p className="text-sm text-ink-soft">Henüz karar yok. Konuşurken buraya ekle.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {actions.map((a) => (
            <li key={a.id} className="flex items-start gap-2 rounded-2xl border-2 border-line p-3">
              <input
                type="checkbox"
                className="mt-1 size-5 accent-teal shrink-0"
                checked={a.done}
                disabled={!isHost}
                onChange={(e) => toggleDone(a.id, e.target.checked)}
                aria-label="Tamamlandı"
              />
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <span className={a.done ? 'line-through text-ink-soft' : ''}>{a.body}</span>
                {isHost ? (
                  <select
                    className="input-blob py-1.5 text-sm max-w-52"
                    value={a.owner_member_id ?? ''}
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
                  <span className="text-xs font-semibold text-ink-soft">
                    {a.owner_member_id
                      ? `👤 ${members.find((m) => m.id === a.owner_member_id)?.display_name ?? '—'}`
                      : 'sahibi yok'}
                  </span>
                )}
              </div>
              {isHost && (
                <button className="text-xs text-ink-soft underline shrink-0" onClick={() => remove(a.id)}>
                  sil
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isHost && (
        <div className="flex items-center gap-2">
          <input
            className="input-blob flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Yeni karar…"
            maxLength={500}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn-coral" onClick={add} disabled={!draft.trim()}>
            Ekle
          </button>
        </div>
      )}
    </section>
  )
}
