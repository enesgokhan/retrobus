import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useMeeting } from '../../lib/useMeeting'
import { S } from '../../lib/strings'
import { stageTheme } from '../../lib/theme'
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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState<string | null>(null)
  /**
   * When the confirm was armed. A two-press confirm does not survive a
   * double-click: both presses land, and ending the night is not undoable from
   * anywhere in the app. The second press has to be a decision, not a bounce.
   */
  const [armedAt, setArmedAt] = useState(0)

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
    // Exactly one meeting is live at a time. Without this the app quietly
    // accumulates live meetings, everyone follows whichever is newest, and
    // archiving the current one drops the whole room back into an older night.
    await sb.from('meetings').update({ status: 'done', active_stage_id: null }).eq('status', 'live')
    await sb.from('meetings').insert({ title: newTitle.trim(), status: 'live' })
    setNewTitle('')
  }

  /**
   * End the night.
   *
   * There was no way to do this, and no way to start a second meeting: the
   * create form only rendered when no live meeting existed, so after a dry run
   * the host was locked inside the rehearsal — its test cards, its scores, its
   * used-up stages — with no route back except editing the database by hand.
   * Archiving keeps everything (the yearbook reads archived meetings) and frees
   * the console to start a clean one.
   */
  async function endMeeting() {
    if (!meeting) return
    if (confirmEnd !== meeting.id) {
      setConfirmEnd(meeting.id)
      setArmedAt(Date.now())
      return
    }
    if (Date.now() - armedAt < 700) return // a double-click, not an answer
    setConfirmEnd(null)
    await sb.from('meetings').update({ status: 'done', active_stage_id: null }).eq('id', meeting.id)
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
    // Rank These is scored by a function, not by the state column. Setting
    // state='revealed' directly opened the results with nobody scored — and
    // RankStage only renders its own scoring button while NOT revealed, so the
    // points became permanently unreachable. reveal_ranking scores and sets the
    // state itself, so the console's big button must go through it.
    if (state === 'revealed' && stage.kind === 'rank') {
      const { error } = await sb.rpc('reveal_ranking', { p_stage_id: stage.id })
      if (!error) return
    }
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
    <main className="min-h-dvh max-w-[1400px] mx-auto px-5 py-6 flex flex-col gap-5">
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

      {loading ? (
        <p className="text-ink-soft">{S.loading}</p>
      ) : !meeting ? (
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
        <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-start">
          {/* sol kolon: şoförün kontrolleri */}
          <div className="flex flex-col gap-5 min-w-0">
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

          {/* End of the night. Without this the console could never leave a
              meeting, so a dry run permanently became the real one. */}
          <section className="card flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h3 className="font-bold text-sm">Toplantıyı bitir</h3>
              <p className="text-xs text-ink-soft font-semibold">
                Arşive kaldırır. Yıllık okunmaya devam eder, konsol yeni bir toplantıya hazır olur.
              </p>
            </div>
            <button
              className={confirmEnd === meeting.id ? 'btn-coral text-sm' : 'btn-ghost text-sm'}
              onClick={endMeeting}
              onBlur={() => setConfirmEnd(null)}
            >
              {confirmEnd === meeting.id ? 'Emin misin? Bas' : '🏁 Bitir ve arşivle'}
            </button>
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

          </div>

          {/* sağ kolon: rota — geniş ekranda kendi içinde kayar */}
          <section className="flex flex-col gap-2 min-w-0 xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto xl:pr-1">
            {[...stages]
              .sort((a, b) => a.order_index - b.order_index)
              .map((stage, i, arr) => {
                const isActive = stage.id === meeting.active_stage_id
                const done = stage.state === 'closed'
                const accent = stageTheme(stage.kind).accent
                return (
                  <div
                    key={stage.id}
                    className={[
                      'flex items-center gap-2 rounded-2xl border-2 px-3 py-2 bg-card border-l-[6px] transition',
                      isActive
                        ? 'border-coral bg-rose-soft shadow-[0_3px_0_0_var(--color-coral)]'
                        : done
                          ? 'border-line opacity-55'
                          : 'border-line',
                    ].join(' ')}
                    style={isActive ? undefined : { borderLeftColor: accent }}
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
                        {/* several presets name a stop after its kind, so the row
                            printed the same words twice: "Lean Coffee" then
                            "Lean Coffee · Hazırlanıyor" */}
                        {S.kind[stage.kind].toLocaleLowerCase('tr') !==
                          stage.title.trim().toLocaleLowerCase('tr') && `${S.kind[stage.kind]} · `}
                        {stage.state === 'pending' ? S.stagePending : stage.state === 'open' ? S.stageOpen : stage.state === 'revealed' ? S.stageRevealed : S.stageClosed}
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
                        <button className="btn-ghost text-xs px-3 py-1.5" onClick={() => activate(stage)}>
                          {S.makeActive}
                        </button>
                      )}
                      {isActive && stage.state === 'open' && (
                        <button className="btn-coral text-xs px-3 py-1.5" onClick={() => setState(stage, 'revealed')}>
                          {S.revealStage}
                        </button>
                      )}
                      {isActive && stage.state === 'revealed' && (
                        <button className="btn-coral text-xs px-3 py-1.5" onClick={() => setState(stage, 'closed')}>
                          {S.closeStage}
                        </button>
                      )}
                      {/* One way back. Revealing a board closes writing for
                          good, and on the night somebody is always still
                          typing when the host presses it — without this there
                          was no undo anywhere in the run of show. */}
                      {isActive && (stage.state === 'revealed' || stage.state === 'closed') && (
                        <button
                          className="btn-ghost text-xs px-3 py-1.5"
                          onClick={() => setState(stage, stage.state === 'closed' ? 'revealed' : 'open')}
                          title="Bir adım geri al"
                        >
                          ↩︎ Geri
                        </button>
                      )}
                      {!isActive && stage.state === 'pending' && (
                        <button
                          className={[
                            'text-xs px-2 py-1 rounded-full font-bold transition',
                            confirmDelete === stage.id
                              ? 'bg-coral text-white'
                              : 'text-ink-soft underline hover:text-coral',
                          ].join(' ')}
                          onClick={() => {
                            // it sat 8px from the biggest target on the row and
                            // destroyed an agenda stop on a single click
                            if (confirmDelete !== stage.id) {
                              setConfirmDelete(stage.id)
                              setArmedAt(Date.now())
                              return
                            }
                            if (Date.now() - armedAt < 700) return
                            setConfirmDelete(null)
                            void removeStage(stage)
                          }}
                          onBlur={() => setConfirmDelete((c) => (c === stage.id ? null : c))}
                        >
                          {confirmDelete === stage.id ? 'Emin misin?' : S.delete}
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
        </div>
      )}
    </main>
  )
}
