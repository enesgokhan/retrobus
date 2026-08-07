/**
 * A diverging stacked bar, centred on the neutral answer.
 *
 * The team health check asks six questions with three ordered answers each
 * (kötü / orta / iyi). That is a Likert scale, and the reader's job is polarity
 * — which dimensions is the team unhappy about — so the correct form is a
 * diverging stacked bar centred on neutral. It used to be six rows of three
 * buttons and a single flat stacked bar with no baseline, which shows the
 * counts but not the lean.
 *
 * WHY NOT A RADAR. Every other retro tool draws a team radar, and it was the
 * obvious thing to copy. A radar plots the AVERAGE per dimension, and an
 * average is exactly the wrong summary here: a dimension where half the team
 * says "great" and half says "awful" averages to "fine". Disagreement is the
 * single most useful signal a health check produces, and the radar throws it
 * away. The diverging bar shows the split, so a divided team looks divided.
 *
 * COLOUR. Red↔green is the worst possible pair for colour-blindness, so it was
 * measured rather than assumed (the dataviz validator, all-pairs):
 *
 *     dark   #ff453a ↔ #32d74b   ΔE 9.2 deutan   PASS (target ≥8)
 *     light  #bd2417 ↔ #146c34   ΔE 7.8 protan   WARN — floor band
 *
 * The light-mode pair sits in the 6–8 floor band, which is legal only with a
 * secondary encoding, so every segment also carries its shape (▼ ● ▲) and its
 * count, and the legend names all three. Note also that darkening the green to
 * satisfy the lightness band made CVD separation WORSE (9.2 → 5.0): under
 * deuteranopia the two hues converge and lightness is what separates them. The
 * bright green is out of band on purpose.
 */
export interface LikertRow {
  key: string
  label: string
  /** counts, worst → best */
  bad: number
  mid: number
  good: number
}

export default function LikertBar({
  rows,
  labels = ['Kötü', 'Orta', 'İyi'],
}: {
  rows: LikertRow[]
  labels?: [string, string, string] | string[]
}) {
  // Each side of centre is scaled against the widest side across all rows, so
  // the rows are comparable to each other rather than each filling its own
  // width. The neutral straddles the centre line, half on each arm — the
  // standard way to centre a Likert bar on "no opinion either way".
  const maxSide = Math.max(
    1,
    ...rows.flatMap((r) => [r.bad + r.mid / 2, r.good + r.mid / 2]),
  )
  const pct = (v: number) => (v / maxSide) * 50

  const total = (r: LikertRow) => r.bad + r.mid + r.good

  return (
    <figure className="w-full m-0 flex flex-col gap-4">
      {/* Legend: identity never rests on colour alone. */}
      <div className="flex items-center gap-4 flex-wrap text-footnote text-label-2">
        {[
          { c: 'var(--color-bad)', s: '▼', t: labels[0] },
          { c: 'var(--color-gray)', s: '●', t: labels[1] },
          { c: 'var(--color-ok)', s: '▲', t: labels[2] },
        ].map((l) => (
          <span key={l.t} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-[2px]"
              style={{ background: l.c }}
            />
            <span aria-hidden className="text-label-3">{l.s}</span>
            {l.t}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const n = total(r)
          const half = r.mid / 2
          return (
            <div key={r.key} className="grid grid-cols-[minmax(6rem,9rem)_1fr_2.5rem] items-center gap-3">
              <span className="text-subhead text-label-2 truncate" title={r.label}>
                {r.label}
              </span>

              {/* the plot: centre line at 50%, arms growing outward */}
              <span className="relative block h-5">
                {/* the baseline the bar diverges from — recessive, hairline */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-sep"
                />
                {n > 0 && (
                  <>
                    {/* worse-than-neutral, growing left */}
                    <Seg
                      side="left"
                      offset={pct(half)}
                      width={pct(r.bad)}
                      color="var(--color-bad)"
                      title={`${r.label} — ${labels[0]}: ${r.bad}/${n}`}
                    />
                    <Seg
                      side="left"
                      offset={0}
                      width={pct(half)}
                      color="var(--color-gray)"
                      flat
                      title={`${r.label} — ${labels[1]}: ${r.mid}/${n}`}
                    />
                    {/* neutral's other half, and better-than-neutral */}
                    <Seg
                      side="right"
                      offset={0}
                      width={pct(half)}
                      color="var(--color-gray)"
                      flat
                      title={`${r.label} — ${labels[1]}: ${r.mid}/${n}`}
                    />
                    <Seg
                      side="right"
                      offset={pct(half)}
                      width={pct(r.good)}
                      color="var(--color-ok)"
                      title={`${r.label} — ${labels[2]}: ${r.good}/${n}`}
                    />
                  </>
                )}
              </span>

              <span className="text-footnote text-label-3 nums text-right">{n}</span>
            </div>
          )
        })}
      </div>

      {/* The numbers, for anyone the chart does not reach. */}
      <details className="text-footnote text-label-3">
        <summary className="cursor-pointer select-none">Sayılar</summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left">
            <thead>
              <tr className="text-label-3">
                <th className="font-normal py-1 pr-3">Boyut</th>
                {labels.map((l) => (
                  <th key={l} className="font-normal py-1 pr-3 nums">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-label-2">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-1 pr-3">{r.label}</td>
                  <td className="py-1 pr-3 nums">{r.bad}</td>
                  <td className="py-1 pr-3 nums">{r.mid}</td>
                  <td className="py-1 pr-3 nums">{r.good}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

/**
 * One segment. The 2px inset is the surface gap that separates touching
 * segments — a stroke around each would add ink that is not data.
 */
function Seg({
  side,
  offset,
  width,
  color,
  title,
  flat = false,
}: {
  side: 'left' | 'right'
  offset: number
  width: number
  color: string
  title: string
  /** the neutral halves butt against the centre line, so they get no radius */
  flat?: boolean
}) {
  if (width <= 0) return null
  const outer = side === 'left' ? '4px 0 0 4px' : '0 4px 4px 0'
  return (
    <span
      title={title}
      className="absolute top-0 bottom-0 transition-[width] duration-500"
      style={{
        [side === 'left' ? 'right' : 'left']: `calc(50% + ${offset}%)`,
        width: `calc(${width}% - 2px)`,
        background: color,
        borderRadius: flat ? 0 : outer,
      }}
    />
  )
}
