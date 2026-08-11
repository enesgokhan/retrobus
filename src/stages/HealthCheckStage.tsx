import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import StageHeader from '../components/StageHeader'
import Alert from '../components/ui/Alert'
import LikertBar from '../components/ui/LikertBar'
import type { Stage } from '../lib/types'

export interface Dimension {
  key: string
  label: string
}

export const DEFAULT_DIMENSIONS: Dimension[] = [
  { key: 'fun', label: 'Eğlence' },
  { key: 'teamwork', label: 'Takım Çalışması' },
  { key: 'learning', label: 'Öğrenme' },
  { key: 'speed', label: 'Hız' },
  { key: 'mission', label: 'Misyon' },
  { key: 'support', label: 'Destek' },
]

/**
 * Kırmızı/sarı/yeşil, renk körlüğü için en kötü kombinasyon (deuteranopia
 * erkeklerin ~%8'inde var; 7-10 kişilik bir grupta ihmal edilebilir değil).
 * O yüzden her seçenek renkten BAĞIMSIZ olarak da ayırt edilebilir: farklı
 * şekil, farklı yazı, farklı konum.
 */
/**
 * The shapes carry U+FE0E (VARIATION SELECTOR-15) — "render this as text, not
 * as an emoji". Without it ▲ ● ▼ are free to pick up a colour emoji glyph, and
 * a 36px control ends up containing a solid white lozenge. The same three
 * characters rendered as arrows on one machine and as blobs on another.
 *
 * Colour is never the only signal here: each rating also has its own shape, so
 * the scale survives colour blindness and a compressed video stream.
 */
const RATINGS = [
  { value: 3, shape: '▲︎', emoji: '🟢', label: 'İyi', bg: 'bg-teal-soft', ring: 'shadow-[inset_0_0_0_1px_var(--color-teal)] text-teal', bar: 'bg-teal' },
  { value: 2, shape: '●︎', emoji: '🟡', label: 'Orta', bg: 'bg-amber-soft', ring: 'shadow-[inset_0_0_0_1px_var(--color-amber)] text-amber', bar: 'bg-amber' },
  { value: 1, shape: '▼︎', emoji: '🔴', label: 'Kötü', bg: 'bg-rose-soft', ring: 'shadow-[inset_0_0_0_1px_var(--color-bad)] text-bad', bar: 'bg-coral' },
]

interface Row {
  dimension_key: string
  rating: number
}

/** Takım nabzı — anonim kırmızı/sarı/yeşil, toplu ısı şeridi olarak açılır. */
export default function HealthCheckStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const dims = (stage.config.dimensions as Dimension[] | undefined) ?? DEFAULT_DIMENSIONS
  const [rows, setRows] = useState<Row[]>([])
  /**
   * Your own answers, kept on your own device.
   *
   * health_responses is deliberately anonymous — there is no member column — so
   * the server cannot tell you what you chose, and after a reload every button
   * in a rated row faded equally and your own answer became invisible. This is
   * the one place it can live without a server-side record of who said what.
   */
  const mineKey = `retrobus.health.${stage.id}`
  const [mine, setMine] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(mineKey) ?? '{}') as Record<string, number>
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(mineKey, JSON.stringify(mine))
    } catch {
      /* a full or blocked store just means the highlight is lost on reload */
    }
  }, [mine, mineKey])
  const [done, setDone] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const isOpen = stage.state === 'open'
  const showResults = stage.state === 'revealed' || stage.state === 'closed'

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      const [{ data: r }, { data: p }] = await Promise.all([
        supabase.from('health_responses').select('dimension_key, rating').eq('stage_id', stage.id),
        supabase.from('participation').select('action_key, count').eq('stage_id', stage.id),
      ])
      if (cancelled) return
      setRows((r as Row[]) ?? [])
      // our own ledger tells us which dimensions we already rated
      const spent = new Set<string>()
      for (const row of (p as { action_key: string; count: number }[]) ?? []) {
        if (row.action_key.startsWith('health:') && row.count > 0) {
          spent.add(row.action_key.slice('health:'.length))
        }
      }
      setDone(spent)
    }
    load()
    const channel = liveChannel(`health-${stage.id}`, ['health_responses', 'participation', 'stages'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  /**
   * Dimensions with a submit in flight.
   *
   * Two quick taps on one dimension used to race: the first answer landed, the
   * second came back "one per dimension", and the handler rolled back — so the
   * answer that HAD been recorded vanished from the screen, an error appeared
   * saying you had already voted, and the row was frozen because `done` had it.
   * You were left with no selection, a false error, and no way to correct it.
   *
   * A ref rather than state: it has to be readable synchronously, before the
   * second click's render.
   */
  const inFlight = useRef<Set<string>>(new Set())

  async function rate(dim: string, rating: number) {
    if (inFlight.current.has(dim) || done.has(dim)) return
    inFlight.current.add(dim)
    setError(null)
    setMine((m) => ({ ...m, [dim]: rating }))
    const { error: e } = await supabase.rpc('submit_health', {
      p_stage_id: stage.id,
      p_dimension_key: dim,
      p_rating: rating,
    })
    inFlight.current.delete(dim)
    if (!e) {
      setDone((d) => new Set(d).add(dim))
      return
    }
    // "already answered" is not a failure to undo — the server is telling us an
    // answer exists. Rolling the optimistic value back would erase a recorded
    // vote from the screen; keep it and settle the row.
    if (e.message.includes('limit')) {
      setDone((d) => new Set(d).add(dim))
      return
    }
    setMine((m) => {
      const next = { ...m }
      delete next[dim]
      return next
    })
    setError('Kaydedilemedi, tekrar dene.')
  }

  const allDone = dims.every((d) => done.has(d.key))

  return (
    <div className="w-full max-w-3xl flex-1 flex flex-col gap-6">
      <StageHeader
        phase={showResults ? 'Sonuçlar' : 'Nabız zamanı'}
        instruction={
          showResults ? 'Her boyut için odanın dağılımı.'
          : allDone ? 'Hepsini oyladın — diğerlerini bekliyoruz.'
          : `Her boyut için birini seç (${done.size}/${dims.length}). Tamamen anonim.`
        }
        waiting={showResults ? false : allDone}
        /* While voting, this is YOUR progress through the six questions. Once
           the results are up it was still counting the reader's own answers,
           so a host who had not voted saw "0/6" over a chart full of data. */
        progress={showResults ? null : `${done.size}/${dims.length}`}
        presenter={presenter}
      />

      {error && <Alert>{error}</Alert>}

      {/* One chart, all six dimensions, diverging from the neutral answer — so
          "which of these is the team unhappy about" is a glance rather than six
          comparisons. */}
      {showResults && (
        <LikertBar
          rows={dims.map((d) => {
            const forDim = rows.filter((r) => r.dimension_key === d.key)
            return {
              key: d.key,
              label: d.label,
              bad: forDim.filter((r) => r.rating === 1).length,
              mid: forDim.filter((r) => r.rating === 2).length,
              good: forDim.filter((r) => r.rating === 3).length,
            }
          })}
        />
      )}

      {/* Six dimensions is a list, not six stacked panels. Each was its own
          rounded card with a gap, so the eye counted six objects before it
          read one label. */}
      {!showResults && (
      <div className="list-group">
      {dims.map((d) => {
        const answered = done.has(d.key)

        return (
          <section key={d.key} className="list-row flex-wrap gap-y-3 py-3">
            <h3 className={['flex-1 min-w-40', presenter ? 'text-title-3' : 'text-headline'].join(' ')}>
              {d.label}
            </h3>

            {isOpen && !presenter && (
              <div className="flex gap-2 shrink-0">
                {RATINGS.map((r) => {
                  const chosen = mine[d.key] === r.value
                  return (
                    <button
                      key={r.value}
                      className={[
                        'w-24 rounded-sm py-2 text-subhead font-semibold min-h-11',
                        'transition-[background-color,box-shadow,opacity] duration-150',
                        chosen ? `${r.bg} ${r.ring}` : 'bg-fill-3 hover:bg-fill-2 text-label-2',
                        // fade the roads not taken, never your own answer —
                        // the whole row used to dim once you had chosen, making
                        // your choice the faintest thing on it
                        answered && !chosen ? 'opacity-35' : '',
                        'disabled:cursor-default',
                      ].join(' ')}
                      onClick={() => rate(d.key, r.value)}
                      disabled={answered}
                    >
                      <span aria-hidden className="mr-1.5 text-headline">
                        {r.shape}
                      </span>
                      {r.label}
                    </button>
                  )
                })}
              </div>
            )}


          </section>
        )
      })}
      </div>
      )}
    </div>
  )
}
