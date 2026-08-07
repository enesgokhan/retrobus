import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { castDot, submitCard, type SubmitError } from '../lib/anon'
import { useStageData } from '../lib/useStageData'
import { useProgress } from '../lib/useProgress'
import ActionsPanel from '../components/ActionsPanel'
import StageHeader from '../components/StageHeader'
import Alert from '../components/ui/Alert'
import Empty from '../components/ui/Empty'
import Button from '../components/ui/Button'
import Segmented from '../components/ui/Segmented'
import { S } from '../lib/strings'
import type { Stage } from '../lib/types'
import Icon from '../components/ui/Icon'

const DEFAULT_COLUMNS = [{ key: 'all', label: 'Kartlar' }]

// Static map: Tailwind only emits classes it can see as literals in the source,
// so a concatenated `lg:grid-cols-${n}` would silently produce no CSS.
// `items-start` matters: without it every card in a row stretches to the
// tallest, so one long thought inflates two short ones into half-empty boxes.
const GRID_BY_COLUMNS: Record<number, string> = {
  1: 'grid gap-3 items-start sm:grid-cols-2 lg:grid-cols-3',
  2: 'grid gap-3 items-start sm:grid-cols-2 lg:grid-cols-3',
  3: 'grid gap-3 items-start sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid gap-3 items-start sm:grid-cols-2 lg:grid-cols-4',
}

/**
 * Columns as a function of how many cards there are, for a board that has no
 * columns of its own. Literal class strings for the same reason as above.
 */
const GRID_BY_COUNT = (n: number) =>
  n <= 2
    ? 'grid gap-3 items-start'
    : n <= 6
      ? 'grid gap-3 items-start sm:grid-cols-2'
      : 'grid gap-3 items-start sm:grid-cols-2 lg:grid-cols-3'

/** …and the column narrows with it, so a short board is a block, not a band. */
const WIDTH_BY_COUNT = (n: number) =>
  n <= 2 ? 'max-w-2xl' : n <= 6 ? 'max-w-4xl' : ''

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
  /**
   * The "Kimlik: İsimli" setting had no visible effect: add_card stores
   * author_member_id only on named boards (0002_discussion.sql:116-121) and
   * nothing ever rendered it, so three of the four board presets promised a
   * named board and produced an anonymous one. Anything present here is
   * therefore safe to show — an anonymous board has null.
   */
  const [names, setNames] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('members').select('id, display_name')
      if (cancelled) return
      setNames(Object.fromEntries(((data as { id: string; display_name: string }[]) ?? [])
        .map((m) => [m.id, m.display_name])))
    })()
    return () => { cancelled = true }
  }, [])
  const wrote = useProgress(stage.id, 'card')
  const voted = useProgress(stage.id, 'dot')
  const [draft, setDraft] = useState('')
  /** which column the next card goes to; only meaningful on a multi-column board */
  const [column, setColumn] = useState('all')
  const [busy, setBusy] = useState(false)
  const [promoted, setPromoted] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const columns = stage.config.columns?.length ? stage.config.columns : DEFAULT_COLUMNS
  // `column` is seeded with the single-column key, so on a multi-column board
  // fall back to the first real column until the writer picks one.
  const activeColumn = columns.some((c) => c.key === column) ? column : columns[0].key
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

  /** Kartı karara dönüştür — tartışmanın çıktısı bu. */
  async function promote(cardId: string, body: string) {
    const { error: e } = await sb.from('actions').insert({
      meeting_id: stage.meeting_id,
      source_card_id: cardId,
      body,
    })
    if (e) setError('Karara dönüştürülemedi.')
    else setPromoted((p) => new Set(p).add(cardId))
  }

  const visible = cards.filter((c) => isHost || !c.hidden)

  /**
   * Cards for a column. During submission the order is `sort_seed` (set by the
   * server) — never insertion order, which would leak who wrote when. Once
   * voting opens, ordering by votes is both safe and what the room wants:
   * popularity says nothing about authorship, and the top items are what you
   * actually discuss.
   */
  function cardsFor(colKey: string) {
    const inCol = visible.filter((c) => (colKey === 'all' ? true : c.column_key === colKey))
    if (!votingPhase) return inCol
    return [...inCol].sort((a, b) => (dots[b.id] ?? 0) - (dots[a.id] ?? 0) || a.sort_seed - b.sort_seed)
  }

  /** 0 = the room's pick, 1 = also up there, 2 = the rest. The board is already
   *  sorted by votes once voting opens; nothing on screen said so. */
  function rankOf(colKey: string, cardId: string): 0 | 1 | 2 {
    if (!votingPhase) return 2
    const ordered = cardsFor(colKey)
    const i = ordered.findIndex((c) => c.id === cardId)
    if (i < 0 || (dots[cardId] ?? 0) === 0) return 2
    return i === 0 ? 0 : i < 3 ? 1 : 2
  }

  const tile = (c: (typeof visible)[number], colKey = 'all') => (
    <CardTile
      key={c.id}
      body={c.body}
      hidden={c.hidden}
      rank={rankOf(colKey, c.id)}
      // a sparse board earns bigger type; a full one needs the density
      roomy={columns.length === 1 && visible.length <= 6}
      author={c.author_member_id ? (names[c.author_member_id] ?? null) : null}
      votes={dots[c.id] ?? 0}
      showVotes={votingPhase}
      canVote={votingPhase && !presenter && myDots < dotBudget}
      isHost={isHost && !presenter}
      promoted={promoted.has(c.id)}
      canPromote={isHost && !presenter && votingPhase}
      onVote={() => dot(c.id)}
      onToggleHidden={() => toggleHidden(c.id, !c.hidden)}
      onPromote={() => promote(c.id, c.body)}
    />
  )

  const header = (() => {
    if (isOpen && canSubmit) {
      return {
        phase: 'Yazma zamanı',
        instruction: stage.config.reveal === 'live'
          ? 'Aklına geleni yaz — herkes anında görüyor.'
          : 'Aklına geleni yaz. Kartlar herkes bitirince açılacak.',
        waiting: false,
      }
    }
    if (isOpen) return { phase: 'Yazma zamanı', instruction: 'Kart hakkın doldu — diğerlerini bekliyoruz.', waiting: true }
    if (votingPhase) {
      return myDots >= dotBudget
        ? { phase: 'Oylama', instruction: 'Oy hakkın bitti. En çok oy alanları konuşacağız.', waiting: true }
        : visible.length === 0
          // revealed with nothing on it — usually the host moved on early
          ? { phase: 'Oylama', instruction: 'Bu panoya hiç kart yazılmamış.', waiting: true }
          : { phase: 'Oylama', instruction: `Konuşmak istediklerine oy ver (${dotBudget - myDots} hakkın var).`, waiting: false }
    }
    return { phase: 'Kapandı', instruction: 'Bu durak tamamlandı.', waiting: true }
  })()

  return (
    <div className="w-full flex-1 flex flex-col gap-6">
      <StageHeader
        {...header}
        presenter={presenter}
        progress={
          isOpen && wrote.total > 0 ? `${wrote.done}/${wrote.total} yazdı`
          : votingPhase && voted.total > 0 ? `${voted.done}/${voted.total} oyladı`
          : null
        }
      />

      {/* The composer. No card around it: a recessed field already reads as a
          distinct object, and wrapping it put a third grey rounded rect on a
          screen that had two too many. */}
      {canSubmit && !presenter && (
        <div className="flex flex-col gap-2.5 max-w-3xl">
          <textarea
            className="field-lg resize-none"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Bir şey yaz…"
            maxLength={500}
            onKeyDown={(e) => {
              // the room is typing one-liners; Enter should send them
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                e.preventDefault()
                void send(activeColumn === 'all' ? null : activeColumn)
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            {/* Where it goes is a CHOICE, and one primary action sends it.
                A board with four columns used to render four filled buttons
                labelled with the column names — four things competing to be
                the one thing to press, and "Biz buyuz" alone does not read as
                a verb. (An earlier pass wrote "Biz buyuz'e ekle", which is
                wrong Turkish: vowel harmony wants 'a there.) */}
            {columns.length > 1 && (
              <Segmented
                aria-label="Sütun"
                value={activeColumn}
                onChange={setColumn}
                options={columns.map((c) => ({ value: c.key, label: c.label }))}
              />
            )}
            <Button
              variant="filled"
              disabled={!draft.trim()}
              busy={busy}
              onClick={() => send(activeColumn === 'all' ? null : activeColumn)}
            >
              {S.add}
            </Button>
            <span className="text-footnote text-label-3">
              {stage.config.reveal !== 'live'
                ? 'Kartlar herkes yazana kadar gizli kalır.'
                : 'Yazdığın anda herkes görür.'}
            </span>
          </div>
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      {/* Kartlar. The grid answers to HOW MUCH THERE IS, not just to the
          viewport: three cards spread across 1400px is a thin band with a
          void under it, which is exactly what "the screens feel empty" looked
          like. Few cards means fewer, wider columns and bigger type — a
          deliberate, dense block reads as composed; a stretched one reads as
          unfinished. */}
      {visible.length === 0 ? (
        <Empty
          icon={<Icon name="board" size={44} />}
          title={
            isOpen && stage.config.reveal !== 'live' ? 'Kartlar toplanıyor' : 'Henüz kart yok'
          }
          body={
            isOpen && stage.config.reveal !== 'live'
              ? 'Herkes yazdığında hep birlikte göreceğiz.'
              : isOpen
                ? 'İlk yazan sen ol.'
                : 'Bu panoya kimse bir şey yazmamış.'
          }
        />
      ) : (
        <div
          className={[
            columns.length > 1
              ? (GRID_BY_COLUMNS[Math.min(columns.length, 4)] ?? GRID_BY_COLUMNS[4])
              : GRID_BY_COUNT(visible.length),
            columns.length === 1 ? WIDTH_BY_COUNT(visible.length) : '',
          ].join(' ')}
        >
          {columns.map((col) => {
            const inCol = cardsFor(col.key)
            if (columns.length === 1) return inCol.map((c) => tile(c, col.key))
            return (
              <div key={col.key} className="flex flex-col gap-2">
                <h3 className="text-overline uppercase text-label-3 px-1 pb-1">
                  {col.label} <span className="text-label-3 nums">{inCol.length}</span>
                </h3>
                {inCol.map((c) => tile(c, col.key))}
              </div>
            )
          })}
        </div>
      )}

      {/* kararlar: oylama bitince tartışmanın çıktısını topla */}
      {votingPhase && !presenter && <ActionsPanel meetingId={stage.meeting_id} />}
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
  promoted,
  canPromote,
  onVote,
  onToggleHidden,
  onPromote,
  rank = 2,
  author = null,
  roomy = false,
}: {
  body: string
  hidden: boolean
  votes: number
  rank: 0 | 1 | 2
  /** only ever set on a named board */
  author?: string | null
  showVotes: boolean
  canVote: boolean
  isHost: boolean
  promoted: boolean
  canPromote: boolean
  onVote: () => void
  onToggleHidden: () => void
  onPromote: () => void
  /** a sparse board earns bigger type */
  roomy?: boolean
}) {
  return (
    <div
      className={[
        // What someone wrote is the content of this screen, so it gets the
        // content treatment: a surface, generous leading, and body type. The
        // room's pick is the ONE tinted card — rank comes from the sort that
        // already happens, and before this nothing on screen encoded it.
        'group flex items-start gap-3 transition-[background-color,box-shadow] duration-200',
        rank === 0 ? 'card-tinted' : 'card',
        roomy ? 'p-5' : '',
        hidden ? 'opacity-45' : '',
        rank === 1 ? 'hairline' : '',
      ].join(' ')}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <p
          className={[
            'whitespace-pre-wrap break-words',
            rank === 0 ? 'text-title-2' : roomy ? 'text-title-3' : 'text-body',
          ].join(' ')}
        >
          {body}
        </p>

        {(author || hidden) && (
          <p className="text-footnote text-label-3">
            {hidden && <span className="badge mr-2">gizli</span>}
            {author && `— ${author}`}
          </p>
        )}

        {/* Host tools stay quiet until you reach for the card. They are for one
            person out of ten and were previously underlined links sitting at
            the same weight as the author's name. */}
        {(canPromote || isHost) && (
          <div
            className="flex items-center gap-1 flex-wrap -ml-2 opacity-0 transition-opacity duration-150
              group-hover:opacity-100 focus-within:opacity-100"
          >
            {canPromote &&
              (promoted ? (
                <span className="badge-tinted ml-2">karara eklendi</span>
              ) : (
                <button className="btn-plain btn-sm" onClick={onPromote}>
                  Karara dönüştür
                </button>
              ))}
            {isHost && (
              <button className="btn-plain btn-sm !text-label-3" onClick={onToggleHidden}>
                {hidden ? 'Göster' : 'Gizle'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* The vote is the single most-used control of the discussion hour and it
          was a 54×26px pale blob styled like a data field — a bordered box with
          a number in it reads as a readout, not as something you press. It is
          now a pill: filled, round, and it takes the tint on hover so pressing
          it is obviously the thing to do. It stays at full strength once your
          dots run out, because the moment the room sees which cards won is the
          payoff. */}
      {showVotes && (
        <button
          className={[
            'shrink-0 min-w-12 h-12 px-2.5 rounded-full flex flex-col items-center justify-center',
            'leading-none nums transition-[background-color,color,transform] duration-150',
            canVote
              ? 'cursor-pointer bg-fill-2 text-label hover:bg-[color-mix(in_srgb,var(--tint)_22%,transparent)] hover:text-(--tint) active:scale-95'
              : 'bg-fill-3 text-label-2',
          ].join(' ')}
          onClick={onVote}
          disabled={!canVote}
          aria-label={canVote ? 'Bu karta oy ver' : 'Oy hakkın kalmadı'}
        >
          <span className="text-headline">{votes}</span>
          <span className="text-[10px] uppercase tracking-wider mt-0.5 opacity-60">oy</span>
        </button>
      )}
    </div>
  )
}
