import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useMeeting } from '../../lib/useMeeting'
import { S } from '../../lib/strings'
import type { Stage, StageKind } from '../../lib/types'
import { AGENDA_MINUTES, DEFAULT_AGENDA, STAGE_PRESETS } from '../../lib/presets'
import StageControls from './StageControls'
import NowNext from './NowNext'
import HostNav from '../../components/HostNav'
import ConnStatus from '../../components/ConnStatus'
import { useStageReadiness } from '../../lib/useStageReadiness'
import { usePresence } from '../../lib/usePresence'
import PresenceBar from '../../components/PresenceBar'


const ADDABLE_KINDS: StageKind[] = [
  'wordcloud',
  'two_truths',
  'health_check',
  'lean_coffee',
  'board',
  'poll',
  'feedback_wall',
  'suggestions',
  'quiz',
  'codenames',
  'wavelength',
  'leaderboard',
  'fibbage',
  'rank',
  'secret_mission',
  'break',
]

/** Şoför konsolu — rota, durak kontrolleri, zamanlayıcı. */
export default function Host() {
  const { meeting, stages, activeStage, loading } = useMeeting()
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const readiness = useStageReadiness(stages)
  const setupRef = useRef<HTMLDivElement>(null)
  // bumping this forces StageControls open, even if the host had collapsed it
  const [forceSetup, setForceSetup] = useState(0)

  function fixSetup() {
    setForceSetup((n) => n + 1)
    setTimeout(() => setupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
  }
  const here = usePresence(meeting?.id ?? null)
  const [freezeNote, setFreezeNote] = useState('')
  const sb = supabase

  async function toggleFreeze() {
    if (!meeting) return
    await sb
      .from('meetings')
      .update({ frozen: !meeting.frozen, frozen_note: freezeNote.trim() || null })
      .eq('id', meeting.id)
  }

  async function createMeeting() {
    if (!newTitle.trim()) return
    await sb.from('meetings').insert({ title: newTitle.trim(), status: 'live' })
    setNewTitle('')
  }

  function nextOrder() {
    return stages.length ? Math.max(...stages.map((s) => s.order_index)) + 1 : 1
  }

  async function addStage(kind: StageKind) {
    if (!meeting) return
    await sb.from('stages').insert({
      meeting_id: meeting.id,
      kind,
      title: S.kind[kind] ?? kind,
      order_index: nextOrder(),
    })
    setAdding(false)
  }

  /** Hazır 3 saatlik rotayı tek seferde kur. */
  async function seedAgenda() {
    if (!meeting) return
    let order = nextOrder()
    const rows = DEFAULT_AGENDA.flatMap((entry) => {
      const preset = STAGE_PRESETS.find((p) => p.key === entry.preset)
      if (!preset) return []
      return [{
        meeting_id: meeting.id,
        kind: preset.kind,
        title: preset.title,
        order_index: order++,
        config: { ...preset.config, timer_s: entry.minutes * 60 },
      }]
    })
    await sb.from('stages').insert(rows)
    setAdding(false)
  }

  async function addPreset(presetKey: string) {
    if (!meeting) return
    const preset = STAGE_PRESETS.find((p) => p.key === presetKey)
    if (!preset) return
    await sb.from('stages').insert({
      meeting_id: meeting.id,
      kind: preset.kind,
      title: preset.title,
      order_index: nextOrder(),
      config: preset.config,
    })
    setAdding(false)
  }

  async function move(stage: Stage, dir: -1 | 1) {
    const sorted = [...stages].sort((a, b) => a.order_index - b.order_index)
    const i = sorted.findIndex((s) => s.id === stage.id)
    const j = i + dir
    if (j < 0 || j >= sorted.length) return
    const other = sorted[j]
    await Promise.all([
      sb.from('stages').update({ order_index: other.order_index }).eq('id', stage.id),
      sb.from('stages').update({ order_index: stage.order_index }).eq('id', other.id),
    ])
  }

  async function activate(stage: Stage) {
    if (!meeting) return
    await sb.from('meetings').update({ active_stage_id: stage.id }).eq('id', meeting.id)
    if (stage.state === 'pending') {
      await sb.from('stages').update({ state: 'open', opened_at: new Date().toISOString() }).eq('id', stage.id)
    }
  }

  async function setState(stage: Stage, state: Stage['state']) {
    await sb.from('stages').update({ state }).eq('id', stage.id)
  }

  async function removeStage(stage: Stage) {
    await sb.from('stages').delete().eq('id', stage.id)
  }

  // --- shared countdown controls (on the active stage) ---
  async function timerStart(seconds: number) {
    if (!activeStage) return
    const ends = new Date(Date.now() + seconds * 1000).toISOString()
    await sb.from('stages').update({ timer_ends_at: ends, timer_remaining_s: null }).eq('id', activeStage.id)
  }
  async function timerPause() {
    if (!activeStage?.timer_ends_at) return
    const left = Math.max(0, Math.round((new Date(activeStage.timer_ends_at).getTime() - Date.now()) / 1000))
    await sb.from('stages').update({ timer_ends_at: null, timer_remaining_s: left }).eq('id', activeStage.id)
  }
  async function timerResume() {
    if (!activeStage || activeStage.timer_remaining_s == null) return
    await timerStart(activeStage.timer_remaining_s)
  }
  async function timerPlus() {
    if (!activeStage?.timer_ends_at) return
    const ends = new Date(new Date(activeStage.timer_ends_at).getTime() + 60_000).toISOString()
    await sb.from('stages').update({ timer_ends_at: ends }).eq('id', activeStage.id)
  }

  if (loading) return <main className="min-h-dvh grid place-items-center text-ink-soft">{S.loading}</main>

  return (
    <main className="min-h-dvh max-w-3xl mx-auto px-5 py-6 flex flex-col gap-6">
      <ConnStatus />
      <header className="flex flex-col gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <span aria-hidden>🚌</span> {S.hostConsole}
          </h1>
          {meeting && <p className="text-sm font-semibold text-ink-soft truncate">{meeting.title}</p>}
        </div>
        <HostNav />
      </header>

      {!meeting ? (
        <section className="card flex flex-col gap-3">
          <h2 className="font-bold text-lg">{S.newMeeting}</h2>
          <input
            className="input-blob"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={S.meetingTitlePlaceholder}
          />
          <button className="btn-coral self-start" onClick={createMeeting} disabled={!newTitle.trim()}>
            {S.goLive}
          </button>
        </section>
      ) : (
        <>
          <NowNext
            meeting={meeting}
            stages={stages}
            activeStage={activeStage}
            todo={readiness}
            onActivate={activate}
            onSetState={setState}
            onTimerStart={timerStart}
            onTimerPause={timerPause}
            onTimerResume={timerResume}
            onTimerPlus={timerPlus}
            onFixSetup={fixSetup}
          />

          <PresenceBar here={here} />

          <details className="card">
            <summary className="font-bold cursor-pointer flex items-center gap-2">
              💬 Karşılama mesajı
              {!meeting.welcome_note && (
                <span className="text-xs font-semibold text-ink-soft">(boş — kimseye gösterilmiyor)</span>
              )}
            </summary>
            <div className="flex flex-col gap-2 mt-3">
              <p className="text-xs text-ink-soft font-semibold">
                Herkese giriş yaptıktan sonra bir kez gösterilir. Senin sözlerin.
              </p>
              <textarea
                className="input-blob resize-none"
                rows={4}
                defaultValue={meeting.welcome_note ?? ''}
                placeholder={'örn. Hoş geldiniz! Bugün 3 saat boyunca hem konuşacağız hem oynayacağız.\nTelefonunu yanında tut, sırayla ilerleyeceğiz.'}
                maxLength={1000}
                onBlur={async (e) => {
                  const v = e.target.value.trim()
                  await sb.from('meetings').update({ welcome_note: v || null }).eq('id', meeting.id)
                }}
              />
              <p className="text-xs text-ink-soft">Yazıp başka bir yere tıkla — otomatik kaydedilir.</p>
            </div>
          </details>

          <section
            className={[
              'card flex items-center gap-3 flex-wrap py-3',
              meeting.frozen ? 'border-coral bg-rose-soft' : '',
            ].join(' ')}
          >
            <button
              className={meeting.frozen ? 'btn-coral' : 'btn-ghost'}
              onClick={toggleFreeze}
            >
              {meeting.frozen ? `▶ ${S.unfreeze}` : `⏸ ${S.freeze}`}
            </button>
            {!meeting.frozen && (
              <input
                className="input-blob flex-1 min-w-40 py-2 text-sm"
                value={freezeNote}
                onChange={(e) => setFreezeNote(e.target.value)}
                placeholder="Dondurunca gösterilecek not (isteğe bağlı)"
                maxLength={200}
              />
            )}
            {meeting.frozen && (
              <span className="text-sm font-bold text-coral-deep">
                Tüm ekranlar donduruldu.
              </span>
            )}
          </section>

          {activeStage && (
            <div ref={setupRef}>
              <StageControls
                stage={activeStage}
                needsSetup={!!readiness[activeStage.id]?.todo}
                forceOpen={forceSetup}
              />
            </div>
          )}

          <section className="flex flex-col gap-2">
            {[...stages]
              .sort((a, b) => a.order_index - b.order_index)
              .map((stage, i, arr) => {
                const isActive = stage.id === meeting.active_stage_id
                return (
                  <div
                    key={stage.id}
                    className={[
                      'flex items-center gap-2 rounded-2xl border-2 px-3 py-2 bg-card',
                      isActive ? 'border-coral bg-rose-soft/40' : 'border-line',
                    ].join(' ')}
                  >
                    <div className="flex flex-col gap-0.5">
                      <button
                        className="text-ink-soft disabled:opacity-20"
                        disabled={i === 0}
                        onClick={() => move(stage, -1)}
                        aria-label="Yukarı"
                      >
                        ▲
                      </button>
                      <button
                        className="text-ink-soft disabled:opacity-20"
                        disabled={i === arr.length - 1}
                        onClick={() => move(stage, 1)}
                        aria-label="Aşağı"
                      >
                        ▼
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">
                        {i + 1}. {stage.title}
                      </div>
                      <div className="text-xs text-ink-soft font-semibold">
                        {S.kind[stage.kind]} · {stage.state === 'pending' ? S.stagePending : stage.state === 'open' ? S.stageOpen : stage.state === 'revealed' ? S.stageRevealed : S.stageClosed}
                      </div>
                      {readiness[stage.id]?.todo && (
                        <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-soft border border-amber/50 px-2.5 py-0.5 text-xs font-bold">
                          <span aria-hidden>⚠️</span>
                          {readiness[stage.id].todo}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {!isActive && (
                        <button className="btn-coral text-xs px-3 py-1.5" onClick={() => activate(stage)}>
                          {S.makeActive}
                        </button>
                      )}
                      {isActive && stage.state === 'open' && (
                        <button className="btn-ghost text-xs px-3 py-1.5" onClick={() => setState(stage, 'revealed')}>
                          {S.revealStage}
                        </button>
                      )}
                      {isActive && stage.state === 'revealed' && (
                        <button className="btn-ghost text-xs px-3 py-1.5" onClick={() => setState(stage, 'closed')}>
                          {S.closeStage}
                        </button>
                      )}
                      {!isActive && stage.state === 'pending' && (
                        <button
                          className="text-ink-soft text-xs underline"
                          onClick={() => removeStage(stage)}
                        >
                          {S.delete}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

            {adding ? (
              <div className="card">
                {stages.length === 0 && (
                  <div className="mb-5 rounded-2xl border-2 border-coral bg-rose-soft p-4 flex flex-col gap-2">
                    <div className="font-extrabold">🚌 Hazır 3 saatlik rota</div>
                    <p className="text-xs font-semibold">
                      {DEFAULT_AGENDA.length} durak · ~{Math.round(AGENDA_MINUTES / 60)} saat
                      ({AGENDA_MINUTES} dk). Yaklaşık 1 saat tartışma, 2 saat oyun. İstemediklerini
                      sonra sil.
                    </p>
                    <button className="btn-coral self-start text-sm" onClick={seedAgenda}>
                      Rotayı kur
                    </button>
                  </div>
                )}
                <div className="font-bold mb-1">Hazır duraklar</div>
                <p className="text-xs text-ink-soft font-semibold mb-3">
                  Ayarları (kimlik, oy hakkı, süre, yönlendirme metni) önceden dolu gelir.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                  {STAGE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      className="btn-ghost text-sm justify-start"
                      onClick={() => addPreset(p.key)}
                    >
                      {p.label}
                      {p.config.identity === 'anon' && (
                        <span className="text-xs text-ink-soft ml-1">(anonim)</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="font-bold mb-3">Boş durak</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ADDABLE_KINDS.map((k) => (
                    <button key={k} className="btn-ghost text-sm justify-start" onClick={() => addStage(k)}>
                      {S.kind[k]}
                    </button>
                  ))}
                </div>
                <button className="text-ink-soft underline text-sm mt-3" onClick={() => setAdding(false)}>
                  {S.cancel}
                </button>
              </div>
            ) : (
              <button className="btn-ghost self-start" onClick={() => setAdding(true)}>
                ＋ {S.addStop}
              </button>
            )}
          </section>
        </>
      )}
    </main>
  )
}
