import { useNavigate } from 'react-router-dom'
import { S } from '../../lib/strings'
import TimerStrip from '../../components/TimerStrip'
import Button from '../../components/ui/Button'
import { stageTheme } from '../../lib/theme'
import type { Meeting, Stage } from '../../lib/types'

export interface NowBarProps {
  meeting: Meeting
  stages: Stage[]
  activeStage: Stage | null
  /** what still needs host setup, keyed by stage id */
  todo: Record<string, { ready: boolean; todo: string | null }>
  onActivate: (stage: Stage) => void
  onSetState: (stage: Stage, state: Stage['state']) => void
  onTimerStart: (seconds: number) => void
  onTimerPause: () => void
  onTimerResume: () => void
  onTimerPlus: () => void
  /** select the blocked stop in the inspector, where its setup lives */
  onFixSetup: (stage: Stage) => void
}

/**
 * ŞU AN — the one strip that never scrolls away.
 *
 * The insight from watching how this is actually used: over three hours the
 * host is not reading the console, they are glancing at it between sentences.
 * So the two questions it must answer without any scrolling are "where are we"
 * and "what do I press next", and it must answer them in the same place every
 * time.
 *
 * Every stop resolves to exactly ONE primary action, computed here. Previously
 * this lived in a card that scrolled away with everything else, and the button
 * was a full-width coral slab — brand colour, 800px wide, at the top of a
 * column of six unrelated panels.
 */
export default function NowBar(p: NowBarProps) {
  const navigate = useNavigate()
  const { meeting, stages, activeStage, todo } = p
  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index)
  const idx = activeStage ? sorted.findIndex((s) => s.id === activeStage.id) : -1
  const next = idx >= 0 ? sorted[idx + 1] : sorted[0]

  /** The single most useful thing the host can press right now. */
  const primary = (() => {
    if (!activeStage) {
      return next
        ? { label: `Başlat: ${next.title}`, run: () => p.onActivate(next), tone: 'go' as const }
        : null
    }
    const blocked = todo[activeStage.id]?.todo
    if (blocked) {
      // Actionable, not a dead end. Telling the host what is missing and then
      // making them go find it is the worst of both worlds — and it used to
      // print the route to it ("Durak ayarları → Quiz soruları") as if that
      // were an answer. Everything a stop needs now lives in the inspector, so
      // this selects it there.
      const inPanel = activeStage.kind === 'quiz' || activeStage.kind === 'poll'
      return {
        label: blocked,
        run: inPanel ? () => p.onFixSetup(activeStage) : () => navigate('/oda'),
        tone: 'warn' as const,
      }
    }
    if (activeStage.state === 'pending')
      return { label: 'Durağı aç', run: () => p.onSetState(activeStage, 'open'), tone: 'go' as const }
    if (activeStage.state === 'open')
      return {
        label: 'Sonuçları aç',
        run: () => p.onSetState(activeStage, 'revealed'),
        tone: 'go' as const,
      }
    if (activeStage.state === 'revealed')
      return {
        label: 'Durağı kapat',
        run: () => p.onSetState(activeStage, 'closed'),
        tone: 'calm' as const,
      }
    return next
      ? { label: `Sıradaki: ${next.title}`, run: () => p.onActivate(next), tone: 'go' as const }
      : { label: 'Rota tamamlandı', run: null, tone: 'calm' as const }
  })()

  const stateLabel = activeStage
    ? activeStage.state === 'pending'
      ? S.stagePending
      : activeStage.state === 'open'
        ? S.stageOpen
        : activeStage.state === 'revealed'
          ? S.stageRevealed
          : S.stageClosed
    : null

  const totalMin = Math.round(
    sorted.reduce((n, s) => n + ((s.config.timer_s as number | undefined) ?? 0), 0) / 60,
  )
  const doneMin = Math.round(
    sorted
      .filter((s) => s.state === 'closed')
      .reduce((n, s) => n + ((s.config.timer_s as number | undefined) ?? 0), 0) / 60,
  )

  const tint = activeStage ? stageTheme(activeStage.kind).tint : undefined

  return (
    <section
      className="card-lg flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-6 gap-y-4"
      style={tint ? ({ ['--tint' as string]: tint } as React.CSSProperties) : undefined}
    >
      {/* where we are */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-overline uppercase text-label-3">
          <span
            className={['size-2 rounded-full', activeStage ? 'bg-(--tint)' : 'bg-label-4'].join(' ')}
            aria-hidden
          />
          Şu an
          <span className="nums text-label-3">
            {idx >= 0
              ? `· ${idx + 1}/${sorted.length}${totalMin > 0 ? ` · ${doneMin}/${totalMin} dk` : ''}`
              : sorted.length
                ? `· ${sorted.length} durak${totalMin > 0 ? ` · ~${totalMin} dk` : ''}`
                : ''}
          </span>
          {meeting.frozen && <span className="badge ml-1 text-bad">ekranlar donduruldu</span>}
        </div>

        {activeStage ? (
          <div className="flex items-baseline gap-3 flex-wrap mt-1">
            <h2 className="text-title-3 truncate">{activeStage.title}</h2>
            <span className="text-footnote text-label-2">{stateLabel}</span>
          </div>
        ) : (
          <p className="text-title-3 text-label-2 mt-1">
            {sorted.length ? 'Henüz bir durak açılmadı' : 'Rota boş'}
          </p>
        )}
      </div>

      {/* the clock */}
      {activeStage && (
        <div className="flex items-center gap-2 flex-wrap">
          <TimerStrip stage={activeStage} />
          {activeStage.timer_ends_at ? (
            <>
              <Button size="sm" onClick={p.onTimerPause}>
                {S.timerPause}
              </Button>
              <Button size="sm" onClick={p.onTimerPlus}>
                {S.timerPlusMinute}
              </Button>
              {/* once it has run out there is nothing to pause or extend into */}
              {new Date(activeStage.timer_ends_at).getTime() <= Date.now() && (
                <Button
                  size="sm"
                  onClick={() => p.onTimerStart((activeStage.config.timer_s as number) ?? 300)}
                >
                  Yeniden başlat
                </Button>
              )}
            </>
          ) : activeStage.timer_remaining_s != null ? (
            <Button size="sm" onClick={p.onTimerResume}>
              {S.timerResume}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => p.onTimerStart((activeStage.config.timer_s as number) ?? 300)}
            >
              ⏱ {Math.round(((activeStage.config.timer_s as number) ?? 300) / 60)} dk başlat
            </Button>
          )}
        </div>
      )}

      {/* the one thing to press */}
      {primary && (
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          {next && activeStage && (
            <Button size="md" onClick={() => p.onActivate(next)} title={next.title}>
              Atla
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1 sm:flex-none"
            variant={primary.tone === 'go' ? 'filled' : primary.tone === 'warn' ? 'tinted' : 'gray'}
            onClick={() => primary.run?.()}
            disabled={!primary.run}
            style={
              primary.tone === 'warn'
                ? ({ ['--tint' as string]: 'var(--color-warn)' } as React.CSSProperties)
                : undefined
            }
          >
            {primary.label}
          </Button>
        </div>
      )}
    </section>
  )
}
