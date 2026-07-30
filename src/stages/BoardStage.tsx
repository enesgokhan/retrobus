import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { castDot, submitCard, type SubmitError } from '../lib/anon'
import { useStageData } from '../lib/useStageData'
import { S } from '../lib/strings'
import type { Stage } from '../lib/types'

const DEFAULT_COLUMNS = [{ key: 'all', label: 'Kartlar' }]

// Static map: Tailwind only emits classes it can see as literals in the source,
// so a concatenated `lg:grid-cols-${n}` would silently produce no CSS.
const GRID_BY_COLUMNS: Record<number, string> = {
  1: 'grid gap-3 sm:grid-cols-2',
  2: 'grid gap-3 sm:grid-cols-2',
  3: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4',
}

const ERR: Record<SubmitError, string> = {
  limit: 'Hakkın doldu.',
  not_open: 'Bu durak şu an kapalı.',
  range: 'Geçersiz seçim.',
  auth: 'Oturumun düşmüş, tekrar giriş yap.',
  unknown: 'Gönderilemedi, tekrar dene.',
}

/**
 * Tartışma panosu — boards, lean coffee ve öneriler hep bunu kullanır.
 * Kartlar `sort_seed` sırasına göre gelir; gönderim sırası asla görünmez.
 */
export default function BoardStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const sb = supabase
  const { cards, dots, myCards, myDots } = useStageData(stage.id)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const columns = stage.config.columns?.length ? stage.config.columns : DEFAULT_COLUMNS
  const dotBudget = stage.config.dots ?? 3
  const isHost = member?.is_host ?? false
  const isOpen = stage.state === 'open'
  const votingPhase = stage.state === 'revealed' || (isOpen && stage.config.reveal === 'live')
  const canSubmit = isOpen && myCards < 20

  async function send(columnKey: string | null) {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    setError(null)
    const err = await submitCard(sb, { stageId: stage.id, body, columnKey })
    setBusy(false)
    if (err) setError(ERR[err])
    else setDraft('')
  }

  async function dot(cardId: string) {
    if (myDots >= dotBudget) {
      setError(`En fazla ${dotBudget} oy verebilirsin.`)
      return
    }
    const err = await castDot(sb, cardId)
    if (err) setError(ERR[err])
  }

  async function toggleHidden(cardId: string, hidden: boolean) {
    await sb.from('cards').update({ hidden }).eq('id', cardId)
  }

  const visible = cards.filter((c) => isHost || !c.hidden)

  return (
    <div className="w-full max-w-4xl flex flex-col gap-4">
      {/* gönderim */}
      {canSubmit && !presenter && (
        <div className="card flex flex-col gap-3">
          <textarea
            className="input-blob resize-none"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Bir şey yaz…"
            maxLength={500}
          />
          <div className="flex flex-wrap gap-2">
            {columns.map((col) => (
              <button
                key={col.key}
                className="btn-coral text-sm"
                disabled={!draft.trim() || busy}
                onClick={() => send(col.key === 'all' ? null : col.key)}
              >
                {columns.length > 1 ? `${col.label}'e ekle` : S.add}
              </button>
            ))}
          </div>
          {stage.config.reveal !== 'live' && (
            <p className="text-xs text-ink-soft font-semibold">
              🔒 Kartlar herkes yazana kadar gizli kalır.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
      )}

      {votingPhase && !presenter && (
        <p className="text-sm font-semibold text-ink-soft text-center">
          🔵 Oy hakkın: {Math.max(0, dotBudget - myDots)} / {dotBudget}
        </p>
      )}

      {/* kartlar */}
      {visible.length === 0 ? (
        <p className="text-center text-ink-soft">
          {isOpen && stage.config.reveal !== 'live'
            ? 'Kartlar toplanıyor…'
            : 'Henüz kart yok.'}
        </p>
      ) : (
        <div className={GRID_BY_COLUMNS[Math.min(columns.length, 4)] ?? GRID_BY_COLUMNS[4]}>
          {columns.map((col) => {
            const inCol = visible.filter((c) =>
              col.key === 'all' ? true : c.column_key === col.key,
            )
            if (columns.length === 1) {
              return inCol.map((c) => (
                <CardTile
                  key={c.id}
                  body={c.body}
                  hidden={c.hidden}
                  votes={dots[c.id] ?? 0}
                  showVotes={votingPhase}
                  canVote={votingPhase && !presenter && myDots < dotBudget}
                  isHost={isHost && !presenter}
                  onVote={() => dot(c.id)}
                  onToggleHidden={() => toggleHidden(c.id, !c.hidden)}
                />
              ))
            }
            return (
              <div key={col.key} className="flex flex-col gap-2">
                <h3 className="font-extrabold text-sm uppercase tracking-wide text-ink-soft px-1">
                  {col.label} <span className="text-ink-soft/60">({inCol.length})</span>
                </h3>
                {inCol.map((c) => (
                  <CardTile
                    key={c.id}
                    body={c.body}
                    hidden={c.hidden}
                    votes={dots[c.id] ?? 0}
                    showVotes={votingPhase}
                    canVote={votingPhase && !presenter && myDots < dotBudget}
                    isHost={isHost && !presenter}
                    onVote={() => dot(c.id)}
                    onToggleHidden={() => toggleHidden(c.id, !c.hidden)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CardTile({
  body,
  hidden,
  votes,
  showVotes,
  canVote,
  isHost,
  onVote,
  onToggleHidden,
}: {
  body: string
  hidden: boolean
  votes: number
  showVotes: boolean
  canVote: boolean
  isHost: boolean
  onVote: () => void
  onToggleHidden: () => void
}) {
  return (
    <div
      className={[
        'rounded-2xl border-2 bg-card p-4 flex flex-col gap-2',
        hidden ? 'border-dashed border-ink-soft/40 opacity-50' : 'border-line',
      ].join(' ')}
    >
      <p className="whitespace-pre-wrap break-words">{body}</p>
      <div className="flex items-center justify-between gap-2">
        {showVotes ? (
          <button
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold',
              canVote ? 'bg-amber-soft hover:bg-amber/40' : 'bg-bg text-ink-soft',
            ].join(' ')}
            onClick={onVote}
            disabled={!canVote}
          >
            <span aria-hidden>🔵</span> {votes}
          </button>
        ) : (
          <span />
        )}
        {isHost && (
          <button className="text-xs text-ink-soft underline" onClick={onToggleHidden}>
            {hidden ? 'göster' : 'gizle'}
          </button>
        )}
      </div>
    </div>
  )
}
