import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useMeeting } from '../lib/useMeeting'
import AppShell from '../components/AppShell'
import { DEFAULT_DIMENSIONS } from '../stages/HealthCheckStage'
import type { Member } from '../lib/types'

interface Award {
  key: string
  label: string
  member_id: string
  display_name: string
  avatar: string | null
  detail: string
}
interface LeaderRow {
  member_id: string
  display_name: string
  avatar: string | null
  points: number
}
interface CardRow {
  id: string
  stage_id: string
  column_key: string | null
  body: string
  hidden: boolean
}
interface ActionRow {
  id: string
  body: string
  owner_member_id: string | null
  done: boolean
}
interface PollRow {
  id: string
  stage_id: string | null
  question: string
  kind: string
  options: string[]
}
interface MissionRow {
  member_id: string
  body: string
  completed: boolean | null
  revealed: boolean
}
interface FeedbackRow {
  target_member_id: string
  kind: string
  body: string
  hidden: boolean
}

/**
 * Retro Yıllığı — toplantının hatırası.
 *
 * Aynı veriler, rapor gibi değil hatıra gibi sunulur. Geri bildirim duvarı
 * yalnızca şoför açıkça dahil ederse görünür: anonim yazılmış bir şeyi kalıcı
 * bir belgeye koymak ayrı bir karardır.
 */
export default function Yearbook() {
  const { member } = useAuth()
  // the keepsake outlives the meeting it describes
  const { meeting, stages } = useMeeting(undefined, { includeArchived: true })
  // A keepsake with no date on it is minutes. It must be the date of the
  // MEETING, not of the day it happens to be opened — this page is explicitly
  // built to outlive its meeting, so "today" would be wrong every time after.
  const meetingDate = new Date(meeting?.created_at ?? Date.now()).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const [awards, setAwards] = useState<Award[]>([])
  const [board, setBoard] = useState<LeaderRow[]>([])
  const [cards, setCards] = useState<CardRow[]>([])
  const [votes, setVotes] = useState<Record<string, number>>({})
  const [actions, setActions] = useState<ActionRow[]>([])
  const [polls, setPolls] = useState<PollRow[]>([])
  const [pollCounts, setPollCounts] = useState<Record<string, number[]>>({})
  const [health, setHealth] = useState<{ dimension_key: string; rating: number }[]>([])
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [feedback, setFeedback] = useState<FeedbackRow[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [includeFeedback, setIncludeFeedback] = useState(false)
  const [loading, setLoading] = useState(true)

  const isHost = member?.is_host ?? false
  const stageIds = useMemo(() => stages.map((s) => s.id), [stages])
  // a stable primitive key: the effect should re-run when the SET of stages
  // changes, not on every new array identity from the realtime refetch
  const stageKey = stageIds.join(',')

  useEffect(() => {
    if (!meeting || !stageIds.length) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const [aw, lb, cd, vt, ac, pl, hl, ms, fb, mem] = await Promise.all([
        supabase.rpc('awards', { p_meeting_id: meeting.id }),
        supabase.rpc('leaderboard', { p_meeting_id: meeting.id }),
        // sort_seed, always — printing anonymous cards in submission order tells
        // the room who wrote what, which is the one thing the wall promises not to
        supabase.from('cards').select('id, stage_id, column_key, body, hidden, sort_seed')
          .in('stage_id', stageIds).order('sort_seed'),
        supabase.from('votes').select('card_id').in('stage_id', stageIds),
        supabase.from('actions').select('id, body, owner_member_id, done').eq('meeting_id', meeting.id),
        supabase.from('polls').select('id, stage_id, question, kind, options').in('stage_id', stageIds),
        supabase.from('health_responses').select('dimension_key, rating').in('stage_id', stageIds),
        supabase.from('missions').select('member_id, body, completed, revealed').eq('meeting_id', meeting.id),
        supabase.from('feedback_items').select('target_member_id, kind, body, hidden, sort_seed')
          .in('stage_id', stageIds).order('sort_seed'),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
      ])
      if (cancelled) return
      setAwards((aw.data as Award[]) ?? [])
      setBoard((lb.data as LeaderRow[]) ?? [])
      setCards((cd.data as CardRow[]) ?? [])
      const tally: Record<string, number> = {}
      for (const v of (vt.data as { card_id: string }[]) ?? []) {
        tally[v.card_id] = (tally[v.card_id] ?? 0) + 1
      }
      setVotes(tally)
      setActions((ac.data as ActionRow[]) ?? [])
      const pollList = (pl.data as PollRow[]) ?? []
      setPolls(pollList)
      if (pollList.length) {
        const { data: resp } = await supabase
          .from('poll_responses')
          .select('poll_id, choice')
          .in('poll_id', pollList.map((p) => p.id))
        const byPoll: Record<string, number[]> = {}
        for (const r of (resp as { poll_id: string; choice: number }[]) ?? []) {
          ;(byPoll[r.poll_id] ??= []).push(r.choice)
        }
        if (!cancelled) setPollCounts(byPoll)
      }
      setHealth((hl.data as { dimension_key: string; rating: number }[]) ?? [])
      setMissions((ms.data as MissionRow[]) ?? [])
      setFeedback((fb.data as FeedbackRow[]) ?? [])
      setMembers((mem.data as Member[]) ?? [])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on stageKey
    // deliberately: `stages` gets a new array identity on every realtime
    // refetch, which would re-run this whole ten-query load continuously.
  }, [meeting?.id, stageKey])

  const nameOf = (id: string | null) =>
    id ? (members.find((m) => m.id === id)?.display_name ?? '—') : 'sahibi yok'

  const boardStages = stages.filter((s) => ['board', 'lean_coffee', 'suggestions'].includes(s.kind))
  /** dimension key → the Turkish label the room actually saw */
  const dimLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of DEFAULT_DIMENSIONS) map.set(d.key, d.label)
    for (const st of stages) {
      const custom = st.config?.dimensions as { key: string; label: string }[] | undefined
      for (const d of custom ?? []) map.set(d.key, d.label)
    }
    return map
  }, [stages])
  const cloudStages = stages.filter((s) => s.kind === 'wordcloud')
  /** the same word from several people counts once, and counts loudly */
  const cloudWords = useMemo(() => {
    const ids = new Set(cloudStages.map((s) => s.id))
    const tally = new Map<string, number>()
    for (const c of cards) {
      if (!ids.has(c.stage_id) || c.hidden) continue
      const w = c.body.trim()
      if (!w) continue
      tally.set(w, (tally.get(w) ?? 0) + 1)
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
  }, [cards, cloudStages])

  function markdown(): string {
    const L: string[] = []
    L.push(`# 🚌 ${meeting?.title ?? 'Retrobüs'} — Retro Yıllığı`, '')

    if (awards.length) {
      L.push('## Ödüller', '')
      for (const a of awards) L.push(`- **${a.label}**: ${a.display_name} (${a.detail})`)
      L.push('')
    }
    if (board.length) {
      L.push('## Şampiyonluk Tablosu', '')
      board.forEach((r, i) => L.push(`${i + 1}. ${r.display_name} — ${r.points} puan`))
      L.push('')
    }
    if (cloudWords.length) {
      L.push('## Tek kelimeyle', '')
      L.push(cloudWords.map(([w, n]) => (n > 1 ? `**${w}** (${n})` : w)).join(' · '), '')
    }
    for (const st of boardStages) {
      const mine = cards.filter((c) => c.stage_id === st.id && !c.hidden)
      if (!mine.length) continue
      L.push(`## 📌 ${st.title}`, '')
      const cols = st.config.columns ?? [{ key: 'all', label: '' }]
      for (const col of cols) {
        const inCol = mine
          .filter((c) => (col.key === 'all' ? true : c.column_key === col.key))
          .sort((a, b) => (votes[b.id] ?? 0) - (votes[a.id] ?? 0))
        if (!inCol.length) continue
        if (col.label) L.push(`### ${col.label}`, '')
        for (const c of inCol) {
          const v = votes[c.id] ?? 0
          L.push(`- ${c.body}${v ? ` _(${v} oy)_` : ''}`)
        }
        L.push('')
      }
    }
    if (actions.length) {
      L.push('## Kararlar', '')
      for (const a of actions) {
        L.push(`- [${a.done ? 'x' : ' '}] ${a.body} — **${nameOf(a.owner_member_id)}**`)
      }
      L.push('')
    }
    if (polls.length) {
      L.push('## Anketler', '')
      for (const p of polls) {
        const answers = pollCounts[p.id] ?? []
        L.push(`**${p.question}** (${answers.length} cevap)`)
        const labels =
          p.kind === 'scale5'
            ? ['1', '2', '3', '4', '5']
            : p.kind === 'scale10'
              ? Array.from({ length: 10 }, (_, i) => String(i + 1))
              : p.options
        const offset = p.kind.startsWith('scale') ? 1 : 0
        labels.forEach((lab, i) => {
          const n = answers.filter((a) => a === i + offset).length
          if (n) L.push(`- ${lab}: ${n}`)
        })
        L.push('')
      }
    }
    if (health.length) {
      L.push('## Takım Nabzı', '')
      const dims = [...new Set(health.map((h) => h.dimension_key))]
      for (const d of dims) {
        const rows = health.filter((h) => h.dimension_key === d)
        const g = rows.filter((r) => r.rating === 3).length
        const y = rows.filter((r) => r.rating === 2).length
        const r = rows.filter((x) => x.rating === 1).length
        L.push(`- ${dimLabel.get(d) ?? d}: 🟢 ${g} · 🟡 ${y} · 🔴 ${r}`)
      }
      L.push('')
    }
    const revealedMissions = missions.filter((m) => m.revealed)
    if (revealedMissions.length) {
      L.push('## Gizli Görevler', '')
      for (const m of revealedMissions) {
        const mark = m.completed === true ? '✅' : m.completed === false ? '❌' : '❓'
        L.push(`- ${mark} **${nameOf(m.member_id)}**: ${m.body}`)
      }
      L.push('')
    }
    if (includeFeedback) {
      const shown = feedback.filter((f) => !f.hidden)
      if (shown.length) {
        L.push('## Geri Bildirim Duvarı', '')
        L.push('_Anonim yazıldı; şoför bu bölümü yıllığa dahil etmeyi seçti._', '')
        for (const m of members) {
          const mine = shown.filter((f) => f.target_member_id === m.id)
          if (!mine.length) continue
          L.push(`### ${m.display_name}`, '')
          for (const f of mine) {
            const tag = f.kind === 'growth' ? '🌱' : f.kind === 'kudos' ? '💛' : '💪'
            L.push(`- ${tag} ${f.body}`)
          }
          L.push('')
        }
      }
    }
    L.push('---', `_Retrobüs ile oluşturuldu._`)
    return L.join('\n')
  }

  function download() {
    const blob = new Blob([markdown()], { type: 'text/markdown;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `retro-yilligi-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (loading) return <main className="min-h-dvh grid place-items-center text-ink-soft">Yükleniyor…</main>
  if (!meeting) {
    return (
      <main className="min-h-dvh grid place-items-center">
        <p className="text-ink-soft">Aktif toplantı yok.</p>
      </main>
    )
  }

  return (
    <AppShell title="Retro Yıllığı" subtitle={`${meeting.title} · ${meetingDate}`} width="reading">

      <section className="card flex flex-wrap items-center gap-3 print:hidden">
        <button className="btn-coral" onClick={download}>
          ⬇ Markdown indir
        </button>
        <button className="btn-ghost" onClick={() => window.print()}>
          🖨 Yazdır / PDF
        </button>
        {isHost && (
          <label className="flex items-center gap-2 text-sm font-semibold ml-auto">
            <input
              type="checkbox"
              className="size-4 accent-teal"
              checked={includeFeedback}
              onChange={(e) => setIncludeFeedback(e.target.checked)}
            />
            Geri bildirim duvarını dahil et
          </label>
        )}
      </section>

      {isHost && !includeFeedback && feedback.length > 0 && (
        <p className="text-xs font-semibold text-ink-soft print:hidden">
          Geri bildirim duvarı yıllığa dahil edilmedi. Anonim yazılmış bir şeyi kalıcı bir belgeye
          koymak ayrı bir karar — istersen yukarıdan aç.
        </p>
      )}

      {/* the year in single words */}
      {cloudWords.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">Tek kelimeyle</h2>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            {cloudWords.map(([word, n]) => (
              <span
                key={word}
                className="font-extrabold"
                style={{ fontSize: `${Math.min(2.4, 1 + n * 0.35)}rem`, lineHeight: 1.15 }}
                title={n > 1 ? `${n} kişi yazdı` : undefined}
              >
                {word}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* who was on the bus — the class photo */}
      {members.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">Bu otobüsteydik</h2>
          <div className="flex flex-wrap gap-4">
            {members.map((m) => (
              <div key={m.id} className="flex flex-col items-center gap-1 w-20">
                <span className="text-5xl leading-none" aria-hidden>
                  {m.avatar || '🙂'}
                </span>
                <span className="text-sm font-bold text-center leading-tight">{m.display_name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ödüller */}
      {awards.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">Ödüller</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {awards.map((a) => (
              <div key={a.key} className="card flex items-center gap-3 py-3 bg-amber-soft border-amber">
                <span className="text-3xl" aria-hidden>
                  {a.avatar || '🙂'}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wide text-ink-soft">{a.label}</div>
                  <div className="font-extrabold truncate">{a.display_name}</div>
                  <div className="text-xs text-ink-soft">{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* sıralama */}
      {board.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">Şampiyonluk Tablosu</h2>
          {board.map((r, i) => (
            <div key={r.member_id} className="flex items-center gap-3 border-b border-line py-1.5">
              <span className="w-6 text-right font-bold text-ink-soft">{i + 1}</span>
              <span aria-hidden>{r.avatar || '🙂'}</span>
              <span className="flex-1 font-bold">{r.display_name}</span>
              <span className="font-extrabold tabular-nums">{r.points}</span>
            </div>
          ))}
        </section>
      )}

      {/* panolar */}
      {boardStages.map((st) => {
        const mine = cards
          .filter((c) => c.stage_id === st.id && !c.hidden)
          .sort((a, b) => (votes[b.id] ?? 0) - (votes[a.id] ?? 0))
        if (!mine.length) return null
        return (
          <section key={st.id} className="flex flex-col gap-2">
            <h2 className="text-xl font-extrabold">📌 {st.title}</h2>
            <ul className="flex flex-col gap-1">
              {mine.map((c) => (
                <li key={c.id} className="flex items-start gap-2 border-b border-line py-1.5">
                  <span className="flex-1">{c.body}</span>
                  {(votes[c.id] ?? 0) > 0 && (
                    <span className="text-sm font-bold text-ink-soft shrink-0">🔵 {votes[c.id]}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {/* kararlar */}
      {actions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">Kararlar</h2>
          <ul className="flex flex-col gap-1">
            {actions.map((a) => (
              <li key={a.id} className="flex items-start gap-2 border-b border-line py-1.5">
                <span aria-hidden>{a.done ? '☑' : '☐'}</span>
                <span className="flex-1">{a.body}</span>
                <span className="text-sm font-bold text-ink-soft shrink-0">
                  {nameOf(a.owner_member_id)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* gizli görevler */}
      {missions.filter((m) => m.revealed).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">Gizli Görevler</h2>
          <ul className="flex flex-col gap-1">
            {missions
              .filter((m) => m.revealed)
              .map((m) => (
                <li key={m.member_id} className="flex items-start gap-2 border-b border-line py-1.5">
                  <span aria-hidden>
                    {m.completed === true ? '✅' : m.completed === false ? '❌' : '❓'}
                  </span>
                  <span className="font-bold shrink-0">{nameOf(m.member_id)}:</span>
                  <span className="flex-1">{m.body}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* nabız */}
      {health.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">Takım Nabzı</h2>
          {[...new Set(health.map((h) => h.dimension_key))].map((d) => {
            const rows = health.filter((h) => h.dimension_key === d)
            const t = rows.length
            const g = rows.filter((r) => r.rating === 3).length
            const y = rows.filter((r) => r.rating === 2).length
            const r = rows.filter((x) => x.rating === 1).length
            return (
              <div key={d} className="flex items-center gap-3">
                <span className="w-32 font-bold text-sm truncate">{dimLabel.get(d) ?? d}</span>
                <div className="flex-1 flex h-5 rounded-full overflow-hidden border border-line">
                  {r > 0 && <div className="bg-coral" style={{ width: `${(r / t) * 100}%` }} />}
                  {y > 0 && <div className="bg-amber" style={{ width: `${(y / t) * 100}%` }} />}
                  {g > 0 && <div className="bg-teal" style={{ width: `${(g / t) * 100}%` }} />}
                </div>
                <span className="text-xs text-ink-soft tabular-nums shrink-0">{t} oy</span>
              </div>
            )
          })}
        </section>
      )}

      {/* geri bildirim, yalnızca açıkça dahil edilirse */}
      {includeFeedback && feedback.filter((f) => !f.hidden).length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold">Geri Bildirim Duvarı</h2>
          {members.map((m) => {
            const mine = feedback.filter((f) => f.target_member_id === m.id && !f.hidden)
            if (!mine.length) return null
            return (
              <div key={m.id} className="flex flex-col gap-1">
                <h3 className="font-extrabold">{m.display_name}</h3>
                <ul className="flex flex-col gap-1">
                  {mine.map((f, i) => (
                    <li key={i} className="border-b border-line py-1.5">
                      <span aria-hidden className="mr-1">
                        {f.kind === 'growth' ? '🌱' : f.kind === 'kudos' ? '💛' : '💪'}
                      </span>
                      {f.body}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </section>
      )}

      <footer className="text-center text-sm text-ink-soft border-t-2 border-line pt-4">
        Retrobüs
      </footer>
    </AppShell>
  )
}
