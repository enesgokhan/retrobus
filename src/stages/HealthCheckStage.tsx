import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import StageHeader from '../components/StageHeader'
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
const RATINGS = [
  { value: 3, shape: '▲', emoji: '🟢', label: 'İyi', bg: 'bg-teal-soft', ring: 'border-teal', bar: 'bg-teal' },
  { value: 2, shape: '●', emoji: '🟡', label: 'Orta', bg: 'bg-amber-soft', ring: 'border-amber', bar: 'bg-amber' },
  { value: 1, shape: '▼', emoji: '🔴', label: 'Kötü', bg: 'bg-rose-soft', ring: 'border-coral', bar: 'bg-coral' },
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
  const [mine, setMine] = useState<Record<string, number>>({})
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
    const channel = liveChannel(`health-${stage.id}`, ['health_responses', 'participation'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  async function rate(dim: string, rating: number) {
    setError(null)
    setMine((m) => ({ ...m, [dim]: rating }))
    const { error: e } = await supabase.rpc('submit_health', {
      p_stage_id: stage.id,
      p_dimension_key: dim,
      p_rating: rating,
    })
    if (e) {
      setMine((m) => {
        const next = { ...m }
        delete next[dim]
        return next
      })
      setError(e.message.includes('limit') ? 'Bu boyutu zaten oyladın.' : 'Kaydedilemedi.')
    } else {
      setDone((d) => new Set(d).add(dim))
    }
  }

  const allDone = dims.every((d) => done.has(d.key))

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      <StageHeader
        phase={showResults ? 'Sonuçlar' : 'Takım nabzı'}
        instruction={
          showResults ? 'Her boyut için odanın dağılımı.'
          : allDone ? 'Hepsini oyladın — diğerlerini bekliyoruz.'
          : `Her boyut için birini seç (${done.size}/${dims.length}). Tamamen anonim.`
        }
        waiting={showResults ? false : allDone}
        progress={`${done.size}/${dims.length}`}
        presenter={presenter}
      />

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
      )}

      {dims.map((d) => {
        const forDim = rows.filter((r) => r.dimension_key === d.key)
        const total = forDim.length
        const green = forDim.filter((r) => r.rating === 3).length
        const yellow = forDim.filter((r) => r.rating === 2).length
        const red = forDim.filter((r) => r.rating === 1).length
        const answered = done.has(d.key)

        return (
          <section key={d.key} className="card flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className={presenter ? 'text-2xl font-extrabold' : 'font-extrabold'}>{d.label}</h3>
              {showResults && <span className="text-xs font-semibold text-ink-soft">{total} oy</span>}
            </div>

            {isOpen && !presenter && (
              <div className="flex gap-2">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    className={[
                      'flex-1 rounded-2xl border-2 py-3 font-bold transition',
                      mine[d.key] === r.value || (answered && mine[d.key] === r.value)
                        ? `${r.bg} ${r.ring}`
                        : 'border-line hover:border-ink-soft',
                      answered ? 'opacity-50 pointer-events-none' : '',
                    ].join(' ')}
                    onClick={() => rate(d.key, r.value)}
                  >
                    <span aria-hidden className="mr-1.5 text-lg">
                      {r.shape}
                    </span>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            {isOpen && answered && (
              <p className="text-xs font-semibold text-teal">✅ Oyun kaydedildi (anonim).</p>
            )}

            {showResults && total > 0 && (
              <div className="flex h-8 overflow-hidden rounded-full border-2 border-line">
                {red > 0 && (
                  <div className="bg-coral grid place-items-center text-xs font-bold text-white"
                       style={{ width: `${(red / total) * 100}%` }}
                       title={`Kötü: ${red}`}>
                    ▼{red}
                  </div>
                )}
                {yellow > 0 && (
                  <div className="bg-amber grid place-items-center text-xs font-bold text-ink"
                       style={{ width: `${(yellow / total) * 100}%` }}
                       title={`Orta: ${yellow}`}>
                    ●{yellow}
                  </div>
                )}
                {green > 0 && (
                  <div className="bg-teal grid place-items-center text-xs font-bold text-white"
                       style={{ width: `${(green / total) * 100}%` }}
                       title={`İyi: ${green}`}>
                    ▲{green}
                  </div>
                )}
              </div>
            )}
            {showResults && total === 0 && (
              <p className="text-sm text-ink-soft">Oy yok.</p>
            )}
            {isOpen && !presenter && (
              <p className="text-xs text-ink-soft">🔒 Sonuçlar kapanışta toplu açılır.</p>
            )}
          </section>
        )
      })}
    </div>
  )
}
