import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Member } from '../lib/types'

/**
 * Kim odada? — canlı varlık göstergesi.
 * Davetli listesi (`members`) ile şu an bağlı olanları ayırır: başlamadan önce
 * herkesin girdiğini görmek, birinin telefonu düşünce bunu fark etmek için.
 */
export default function PresenceBar({ here }: { here: Set<string> }) {
  const [members, setMembers] = useState<Member[]>([])

  // Deliberately NOT a realtime subscription on `members`: that table holds
  // code_hash, and putting a table with a secret column into the realtime
  // publication is the wrong instinct even though Realtime turns out to respect
  // column grants. The roster barely changes mid-meeting, and presence joins
  // already re-render this component, so refetching on presence change is enough.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('members')
        .select('id, display_name, is_host, avatar')
        .order('display_name')
      if (!cancelled) setMembers((data as Member[]) ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [here.size])

  if (!members.length) return null
  const online = members.filter((m) => here.has(m.id))
  const offline = members.filter((m) => !here.has(m.id))

  return (
    <section className="card flex items-center gap-3 flex-wrap py-3">
      <span className="text-sm font-bold shrink-0">
        🟢 {online.length}/{members.length} odada
      </span>
      <div className="flex flex-wrap gap-1.5">
        {online.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 rounded-full bg-teal-soft border border-teal/40 px-2 py-0.5 text-xs font-bold"
            title={`${m.display_name} — bağlı`}
          >
            <span aria-hidden>{m.avatar || '🙂'}</span>
            {m.display_name}
          </span>
        ))}
        {offline.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-ink-soft opacity-70"
            title={`${m.display_name} — henüz girmedi`}
          >
            <span aria-hidden className="grayscale">
              {m.avatar || '🙂'}
            </span>
            {m.display_name}
          </span>
        ))}
      </div>
    </section>
  )
}
