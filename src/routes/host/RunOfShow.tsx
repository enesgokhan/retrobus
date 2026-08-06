import { S } from '../../lib/strings'
import { stageTheme } from '../../lib/theme'
import type { Stage } from '../../lib/types'

/**
 * The route, as one list.
 *
 * It used to be seventeen separate rounded cards with gaps between them, each
 * carrying its own "Bu durağa geç" button and its own bare "Sil" text link —
 * so the right-hand column was a wall of thirty-four identical controls, and
 * the destructive one sat eight pixels from the one you press constantly.
 *
 * One group, inset separators, and the row IS the control: clicking a stop
 * selects it in the inspector, where everything about it lives. The two things
 * you do while driving — jump to a stop, reorder it — appear on the row you
 * are pointing at. Deleting happens in the inspector, deliberately far from
 * the hand.
 */
export default function RunOfShow({
  stages,
  activeId,
  selectedId,
  readiness,
  onSelect,
  onActivate,
  onMove,
}: {
  stages: Stage[]
  activeId: string | null
  selectedId: string | null
  readiness: Record<string, { ready: boolean; todo: string | null }>
  onSelect: (s: Stage) => void
  onActivate: (s: Stage) => void
  onMove: (s: Stage, dir: -1 | 1) => void
}) {
  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index)

  return (
    <div className="list-group">
      {sorted.map((stage, i) => {
        const live = stage.id === activeId
        const selected = stage.id === selectedId
        const done = stage.state === 'closed'
        const todo = readiness[stage.id]?.todo
        const tint = stageTheme(stage.kind).tint

        // several presets name a stop after its kind, so the row printed the
        // same words twice: "Lean Coffee" then "Lean Coffee · Hazırlanıyor"
        const kindLabel =
          S.kind[stage.kind].toLocaleLowerCase('tr') !== stage.title.trim().toLocaleLowerCase('tr')
            ? S.kind[stage.kind]
            : null
        const stateLabel =
          stage.state === 'pending'
            ? S.stagePending
            : stage.state === 'open'
              ? S.stageOpen
              : stage.state === 'revealed'
                ? S.stageRevealed
                : S.stageClosed

        return (
          <div
            key={stage.id}
            className={[
              'group list-row list-row-inset cursor-pointer transition-colors',
              selected ? 'list-row-selected' : 'hover:bg-fill-3',
              done && !live ? 'opacity-50' : '',
            ].join(' ')}
            style={{ ['--tint' as string]: tint } as React.CSSProperties}
            onClick={() => onSelect(stage)}
            aria-current={selected || undefined}
          >
            {/* position, or the live marker in its place — same slot, so the
                list never shifts when the meeting moves on */}
            <span className="shrink-0 size-8 grid place-items-center" aria-hidden>
              {live ? (
                <span className="relative flex size-2.5">
                  <span
                    className="absolute inline-flex size-full rounded-full opacity-60 animate-ping"
                    style={{ background: tint }}
                  />
                  <span
                    className="relative inline-flex size-2.5 rounded-full"
                    style={{ background: tint }}
                  />
                </span>
              ) : (
                <span className="text-footnote text-label-3 nums">{i + 1}</span>
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span
                className={['block text-headline truncate', live ? 'text-[--tint]' : ''].join(' ')}
              >
                {stage.title}
              </span>
              <span className="block text-footnote text-label-3 truncate mt-0.5">
                {kindLabel && `${kindLabel} · `}
                {stateLabel}
              </span>
            </span>

            {/* what still needs doing, as a dot — the amber outlined pill with
                a navigation path in it was the loudest thing in the column */}
            {todo && (
              <span
                className="shrink-0 size-2 rounded-full bg-warn"
                title={todo}
                aria-label={todo}
              />
            )}

            {/* Jumping to a stop is always available and always in the same
                place. An earlier pass hid it until hover, which is wrong twice
                over: a control the host needs mid-sentence should not require
                aiming first, and on a touch screen there is no hover at all.
                It is an icon rather than "Bu durağa geç" repeated seventeen
                times — the accessible name carries the words. */}
            {!live && (
              <button
                className="shrink-0 size-8 grid place-items-center rounded-full text-label-3
                  hover:text-[--tint] hover:bg-fill-2 active:scale-90
                  transition-[color,background-color,transform] duration-150"
                onClick={(e) => {
                  e.stopPropagation()
                  onActivate(stage)
                }}
                aria-label={S.makeActive}
                title={S.makeActive}
              >
                <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
                  <path d="M4.5 2.8v10.4c0 .5.6.8 1 .5l8-5.2a.6.6 0 000-1L5.5 2.3a.6.6 0 00-1 .5z" />
                </svg>
              </button>
            )}

            {/* Reordering is a planning action, not a driving one, so it stays
                out of the way until you point at the row. Absolutely positioned
                rather than laid out: as flow content these reserved width on
                all seventeen rows whether visible or not, which truncated
                almost every title in a 400px rail. */}
            <span
              className={[
                'absolute right-11 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pl-6',
                'transition-opacity duration-150',
                selected
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
              ].join(' ')}
              style={{
                // fade the row's text out behind the controls instead of
                // letting them land on top of it
                background:
                  'linear-gradient(to right, transparent, var(--color-bg-1) 1.5rem, var(--color-bg-1))',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="size-7 grid place-items-center rounded-xs text-label-3 hover:text-label
                  hover:bg-fill-2 disabled:opacity-20 disabled:hover:bg-transparent"
                disabled={i === 0}
                onClick={() => onMove(stage, -1)}
                aria-label="Yukarı taşı"
              >
                ↑
              </button>
              <button
                className="size-7 grid place-items-center rounded-xs text-label-3 hover:text-label
                  hover:bg-fill-2 disabled:opacity-20 disabled:hover:bg-transparent"
                disabled={i === sorted.length - 1}
                onClick={() => onMove(stage, 1)}
                aria-label="Aşağı taşı"
              >
                ↓
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}
