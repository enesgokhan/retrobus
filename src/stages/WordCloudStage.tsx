import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { submitCard } from '../lib/anon'
import { useStageData } from '../lib/useStageData'
import StageHeader from '../components/StageHeader'
import type { Stage } from '../lib/types'

const SIZES = ['text-lg', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl']
const TINTS = ['text-coral', 'text-teal', 'text-grape', 'text-amber', 'text-sky', 'text-ink']

/**
 * Kelime bulutu — herkes tek kelime yazar, aynı kelimeler büyür.
 * `cards` tablosunu kullanır; kelime sayısı sunucudan gelen sort_seed sırasını
 * bozmaz, gruplama tamamen istemcide lower(body) üzerinden yapılır.
 */
export default function WordCloudStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { cards, myCards } = useStageData(stage.id)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const maxWords = (stage.config.maxWords as number) ?? 3
  const isOpen = stage.state === 'open'
  const canSubmit = isOpen && myCards < maxWords && !presenter

  // aggregate case-insensitively, keep the first spelling seen
  const counts = new Map<string, { label: string; n: number }>()
  for (const c of cards) {
    if (c.hidden) continue
    const key = c.body.trim().toLocaleLowerCase('tr')
    const hit = counts.get(key)
    if (hit) hit.n += 1
    else counts.set(key, { label: c.body.trim(), n: 1 })
  }
  const words = [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'tr'))
  const max = words[0]?.n ?? 1

  async function send() {
    const body = draft.trim()
    if (!body || busy) return
    if (body.includes(' ')) {
      setError('Tek kelime yaz.')
      return
    }
    setBusy(true)
    setError(null)
    const err = await submitCard(supabase, { stageId: stage.id, body, max: maxWords })
    setBusy(false)
    if (err === 'limit') setError('Kelime hakkın doldu.')
    else if (err) setError('Gönderilemedi, tekrar dene.')
    else setDraft('')
  }

  return (
    <div className="w-full max-w-5xl flex flex-col items-center gap-5">
      <StageHeader
        phase={isOpen ? 'Kelime bulutu' : 'Kapandı'}
        instruction={
          !isOpen ? 'Bu durak tamamlandı.'
          : canSubmit ? 'Tek kelime yaz. Aynı kelimeler büyür.'
          : 'Kelime hakkın doldu — bulutu izle.'
        }
        waiting={!canSubmit}
        progress={words.length ? `${words.length} kelime` : null}
        presenter={presenter}
      />
      {canSubmit && (
        <div className="card w-full max-w-md flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              className="input-blob flex-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Tek kelime…"
              maxLength={30}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button className="btn-coral" onClick={send} disabled={!draft.trim() || busy}>
              Ekle
            </button>
          </div>
          <p className="text-xs font-semibold text-ink-soft">
            {maxWords - myCards} kelime hakkın kaldı.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
      )}

      {words.length === 0 ? (
        <p className="text-ink-soft">
          {isOpen ? 'Kelimeler toplanıyor…' : 'Henüz kelime yok.'}
        </p>
      ) : (
        <div
          className={[
            'flex flex-wrap items-center justify-center gap-x-5 gap-y-2',
            presenter ? 'px-10' : 'px-2',
          ].join(' ')}
        >
          {words.map((w, i) => {
            const step = Math.round(((w.n - 1) / Math.max(max - 1, 1)) * (SIZES.length - 1))
            return (
              <span
                key={w.label}
                className={[
                  SIZES[presenter ? Math.min(step + 1, SIZES.length - 1) : step],
                  TINTS[i % TINTS.length],
                  'font-extrabold leading-tight',
                ].join(' ')}
                title={`${w.n}×`}
              >
                {w.label}
                {w.n > 1 && <sub className="text-xs align-super opacity-60 ml-0.5">{w.n}</sub>}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
