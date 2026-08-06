import { useMemo, useState } from 'react'
import { PRESET_GROUPS, STAGE_PRESETS, type StagePreset } from '../../lib/presets'
import { List, Row } from '../../components/ui/List'
import { Field } from '../../components/ui/Field'
import Empty from '../../components/ui/Empty'

const KIND_EMOJI: Record<string, string> = {
  wordcloud: '☁️',
  two_truths: '🤥',
  health_check: '🩺',
  lean_coffee: '☕',
  board: '📌',
  poll: '📊',
  feedback_wall: '💌',
  suggestions: '💡',
  quiz: '🏆',
  codenames: '🕵️',
  wavelength: '📻',
  leaderboard: '🥇',
  break: '🧃',
  fibbage: '🤫',
  rank: '🔢',
  secret_mission: '🕶️',
}

/**
 * Choosing what to add to the route.
 *
 * This used to be two lists: twenty "hazır duraklar" with configuration, and
 * sixteen "boş durak" with the same names and none, one after the other with
 * no search and no sections. The overlap was the problem — "Kelime Bulutu"
 * appeared in both, and nothing on the screen said why you would pick one over
 * the other. The answer was always the configured one, so the second list is
 * gone; the only kind that lacked a preset (a poll) has one now.
 *
 * What is left is one list, grouped by which part of the evening a stop belongs
 * to, with a line under each name saying what it actually is, and a filter for
 * when the host already knows what they want and just wants to type it.
 */
export default function StopPicker({
  onPick,
}: {
  onPick: (presetKey: string) => void
  onCancel?: () => void
}) {
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr')
    const match = (p: StagePreset) =>
      !needle ||
      p.label.toLocaleLowerCase('tr').includes(needle) ||
      (p.blurb ?? '').toLocaleLowerCase('tr').includes(needle)
    return PRESET_GROUPS.map((g) => ({
      ...g,
      items: STAGE_PRESETS.filter((p) => (p.group ?? 'diger') === g.key).filter(match),
    })).filter((g) => g.items.length)
  }, [q])

  const total = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="flex flex-col gap-5">
      <Field
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Durak ara…"
        autoFocus
        aria-label="Durak ara"
      />

      {total === 0 ? (
        <Empty size="sm" title={`“${q}” için durak yok`} body="Başka bir kelime dene." />
      ) : (
        groups.map((g) => (
          <List key={g.key} title={g.label}>
            {g.items.map((p) => (
              <Row
                key={p.key}
                leading={<span className="text-xl">{KIND_EMOJI[p.kind] ?? '🚏'}</span>}
                title={
                  <span className="flex items-center gap-2">
                    {p.label}
                    {p.config.identity === 'anon' && <span className="badge">anonim</span>}
                  </span>
                }
                subtitle={p.blurb}
                onClick={() => onPick(p.key)}
                chevron
              />
            ))}
          </List>
        ))
      )}
    </div>
  )
}
