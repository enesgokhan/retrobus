import { useMemo, useState } from 'react'
import { PRESET_GROUPS, STAGE_PRESETS, type StagePreset } from '../../lib/presets'

/**
 * Choosing what to add to the route.
 *
 * This used to be two lists: twenty "hazır duraklar" with configuration, and
 * sixteen "boş durak" with the same names and none, one after the other with no
 * search and no sections. The overlap was the problem — "Kelime Bulutu" appeared
 * in both, and nothing on the screen said why you would pick one over the other.
 * The answer was always the configured one, so the second list is gone; the only
 * kind that lacked a preset (a poll) has one now.
 *
 * What is left is one list, grouped by which part of the evening a stop belongs
 * to, with a line under each name saying what it actually is, and a filter for
 * when the host already knows what they want and just wants to type it.
 */
export default function StopPicker({
  onPick,
  onCancel,
}: {
  onPick: (presetKey: string) => void
  onCancel: () => void
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <input
          className="input-blob"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Durak ara…"
          autoFocus
          aria-label="Durak ara"
        />
        <button className="btn-ghost shrink-0" onClick={onCancel}>
          Kapat
        </button>
      </div>

      {total === 0 && (
        <p className="text-sm text-ink-soft py-6 text-center">“{q}” için durak yok.</p>
      )}

      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-1.5">
          <h3 className="text-xs uppercase tracking-widest text-ink-faint font-medium">{g.label}</h3>
          {g.items.map((p) => (
            <button
              key={p.key}
              onClick={() => onPick(p.key)}
              className="text-left rounded-[--radius-control] px-3 py-2.5 transition-colors duration-150
                hover:bg-[--color-raised] focus-visible:bg-[--color-raised] outline-none
                focus-visible:shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{p.label}</span>
                {p.config.identity === 'anon' && (
                  <span className="text-[10px] uppercase tracking-wider text-ink-faint">anonim</span>
                )}
              </div>
              {p.blurb && <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{p.blurb}</p>}
            </button>
          ))}
        </section>
      ))}
    </div>
  )
}
