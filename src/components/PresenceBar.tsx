import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Member } from '../lib/types'

/**
 * Kim odada? — live presence.
 *
 * Separates the invited list (`members`) from who is actually connected: for
 * seeing that everyone is in before starting, and for noticing when someone's
 * phone drops out.
 *
 * Deliberately NOT a realtime subscription on `members`: that table holds
 * code_hash, and putting a table with a secret column into the realtime
 * publication is the wrong instinct even though Realtime turns out to respect
 * column grants. The roster barely changes mid-meeting, and presence joins
 * already re-render this component, so refetching on presence change is enough.
 */
export default function PresenceBar({ here }: { here: Set<string> }) {
  const [members, setMembers] = useState<Member[]>([])

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
    <section className="card flex items-center gap-x-4 gap-y-3 flex-wrap">
      <span className="flex items-center gap-2 shrink-0">
        <span className="size-2 rounded-full bg-ok" aria-hidden />
        <span className="text-headline nums">
          {online.length}/{members.length}
        </span>
        <span className="text-footnote text-label-3">odada</span>
      </span>
      <div className="flex flex-wrap gap-1.5">
        {online.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-fill-2 px-2.5 py-1 text-footnote"
            title={`${m.display_name} — bağlı`}
          >
            <span aria-hidden>{m.avatar || '🙂'}</span>
            {m.display_name}
          </span>
        ))}
        {offline.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-footnote
              text-label-3 hairline"
            title={`${m.display_name} — henüz girmedi`}
          >
            <span aria-hidden className="grayscale opacity-60">
              {m.avatar || '🙂'}
            </span>
            {m.display_name}
          </span>
        ))}
      </div>
    </section>
  )
}
