import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { S } from '../../lib/strings'
import TimerStrip from '../../components/TimerStrip'
import type { Meeting, Stage } from '../../lib/types'

export interface NowNextProps {
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
}

/**
 * Şoför konsolunun tepesi: ŞU AN ve SIRADAKİ.
 *
 * Araştırmanın söylediği şey şuydu: Jackbox'ı çalıştıran his, oyuncuya sürekli
 * bir sunucunun eşlik etmesi. Bu uygulamanın en zayıf yeri de buydu — konsol
 * durum gösteriyordu ama şoföre "şimdi şuna bas" demiyordu. 3 saat, 10 kişi ve
 * 17 durak varken şoförün akışı kafasında tutması gerekmemeli.
 *
 * Her durak için tek bir birincil eylem hesaplanır ve büyük düğme olarak
 * sunulur; geri kalan her şey ikincil.
 */
export default function NowNext(p: NowNextProps) {
  const { meeting, stages, activeStage, todo } = p
  const sorted = [...stages].sort((a, b) => a.order_index - b.order_index)
  const idx = activeStage ? sorted.findIndex((s) => s.id === activeStage.id) : -1
  const next = idx >= 0 ? sorted[idx + 1] : sorted[0]

  /** The single most useful thing the host can press right now. */
  const primary = (() => {
    if (!activeStage) {
      return next
        ? { label: `▶ Başlat: ${next.title}`, run: () => p.onActivate(next), tone: 'go' as const }
        : null
    }
    const blocked = todo[activeStage.id]?.todo
    if (blocked) {
      return { label: `⚠️ ${blocked}`, run: null, tone: 'warn' as const }
    }
    if (activeStage.state === 'pending') {
      return { label: '▶ Durağı aç', run: () => p.onSetState(activeStage, 'open'), tone: 'go' as const }
    }
    if (activeStage.state === 'open') {
      return {
        label: '👁 Sonuçları/oylamayı aç',
        run: () => p.onSetState(activeStage, 'revealed'),
        tone: 'go' as const,
      }
    }
    if (activeStage.state === 'revealed') {
      return { label: '✓ Durağı kapat', run: () => p.onSetState(activeStage, 'closed'), tone: 'calm' as const }
    }
    return next
      ? { label: `▶ Sıradakine geç: ${next.title}`, run: () => p.onActivate(next), tone: 'go' as const }
      : { label: '🏁 Rota tamamlandı', run: null, tone: 'calm' as const }
  })()

  const stateLabel = activeStage
    ? activeStage.state === 'pending' ? S.stagePending
      : activeStage.state === 'open' ? S.stageOpen
      : activeStage.state === 'revealed' ? S.stageRevealed
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

  return (
    <section className="card flex flex-col gap-4 border-coral">
      {/* rota konumu */}
      <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
        <span className="font-bold text-ink-soft">
          {idx >= 0 ? `Durak ${idx + 1}/${sorted.length}` : `${sorted.length} durak hazır`}
          {totalMin > 0 && ` · ~${doneMin}/${totalMin} dk`}
        </span>
        <div className="flex items-center gap-2">
          <Link to="/sunum" className="text-ink-soft underline text-xs">
            sunum ekranı
          </Link>
          {meeting.frozen && (
            <span className="rounded-full bg-coral text-white px-2.5 py-0.5 text-xs font-bold">
              ekranlar donduruldu
            </span>
          )}
        </div>
      </div>

      {/* ŞU AN */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">Şu an</span>
        {activeStage ? (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="text-2xl font-extrabold">{activeStage.title}</h2>
              <span className="text-sm font-bold text-ink-soft">{stateLabel}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <TimerStrip stage={activeStage} />
              {activeStage.timer_ends_at ? (
                <>
                  <button className="btn-ghost text-xs px-3 py-1" onClick={p.onTimerPause}>
                    {S.timerPause}
                  </button>
                  <button className="btn-ghost text-xs px-3 py-1" onClick={p.onTimerPlus}>
                    {S.timerPlusMinute}
                  </button>
                </>
              ) : activeStage.timer_remaining_s != null ? (
                <button className="btn-ghost text-xs px-3 py-1" onClick={p.onTimerResume}>
                  {S.timerResume}
                </button>
              ) : (
                <button
                  className="btn-ghost text-xs px-3 py-1"
                  onClick={() => p.onTimerStart((activeStage.config.timer_s as number) ?? 300)}
                >
                  ⏱ {Math.round((((activeStage.config.timer_s as number) ?? 300) / 60))} dk başlat
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="text-ink-soft font-semibold">Henüz bir durak açılmadı.</p>
        )}
      </div>

      {/* birincil eylem */}
      {primary && (
        <button
          className={[
            'text-lg w-full',
            primary.tone === 'go' ? 'btn-coral' : 'btn-ghost',
            primary.tone === 'warn' ? 'bg-amber-soft border-amber cursor-default' : '',
          ].join(' ')}
          onClick={() => primary.run?.()}
          disabled={!primary.run}
        >
          {primary.label}
        </button>
      )}

      {/* SIRADAKİ */}
      {next && (
        <div className="flex items-center justify-between gap-3 border-t-2 border-line pt-3">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">Sıradaki</span>
            <div className="font-bold truncate">
              {next.title}
              {todo[next.id]?.todo && (
                <span className="ml-2 text-xs font-bold text-coral-deep">⚠️ {todo[next.id].todo}</span>
              )}
            </div>
          </div>
          <button className="btn-ghost text-sm shrink-0" onClick={() => p.onActivate(next)}>
            Atla →
          </button>
        </div>
      )}
    </section>
  )
}

/** Advances a stage's state, stamping opened_at the first time it opens. */
export async function setStageState(stage: Stage, state: Stage['state']) {
  const patch: Record<string, unknown> = { state }
  if (state === 'open' && !stage.opened_at) patch.opened_at = new Date().toISOString()
  await supabase.from('stages').update(patch).eq('id', stage.id)
}
