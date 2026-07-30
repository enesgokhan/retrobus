import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { getSupabase } from '../../lib/supabase'
import { useMeeting } from '../../lib/useMeeting'
import { S } from '../../lib/strings'
import type { Stage, StageKind } from '../../lib/types'
import TimerStrip from '../../components/TimerStrip'

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
  'break',
]

/** Şoför konsolu — rota, durak kontrolleri, zamanlayıcı. */
export default function Host() {
  const { session, logout } = useAuth()
  const { meeting, stages, activeStage, loading } = useMeeting()
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const sb = getSupabase(session)

  async function createMeeting() {
    if (!newTitle.trim()) return
    await sb.from('meetings').insert({ title: newTitle.trim(), status: 'live' })
    setNewTitle('')
  }

  async function addStage(kind: StageKind) {
    if (!meeting) return
    const order = stages.length ? Math.max(...stages.map((s) => s.order_index)) + 1 : 1
    await sb.from('stages').insert({
      meeting_id: meeting.id,
      kind,
      title: S.kind[kind] ?? kind,
      order_index: order,
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
  async function timerReset() {
    if (!activeStage) return
    await sb.from('stages').update({ timer_ends_at: null, timer_remaining_s: null }).eq('id', activeStage.id)
  }

  if (loading) return <main className="min-h-dvh grid place-items-center text-ink-soft">{S.loading}</main>

  return (
    <main className="min-h-dvh max-w-3xl mx-auto px-5 py-6 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <span aria-hidden>🚌</span> {S.hostConsole}
        </h1>
        <nav className="flex items-center gap-4 text-sm font-semibold">
          <Link to="/host/uyeler" className="text-coral">
            {S.members}
          </Link>
          <Link to="/oda" className="text-ink-soft">
            Oda
          </Link>
          <Link to="/sunum" className="text-ink-soft">
            Sunum
          </Link>
          <button onClick={logout} className="text-ink-soft underline">
            {S.logout}
          </button>
        </nav>
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
          <section className="card flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm text-ink-soft font-semibold">{S.route}</div>
              <div className="text-xl font-extrabold">{meeting.title}</div>
            </div>
            {activeStage && (
              <div className="flex items-center gap-2 flex-wrap">
                <TimerStrip stage={activeStage} />
                {activeStage.timer_ends_at ? (
                  <>
                    <button className="btn-ghost text-sm" onClick={timerPause}>
                      {S.timerPause}
                    </button>
                    <button className="btn-ghost text-sm" onClick={timerPlus}>
                      {S.timerPlusMinute}
                    </button>
                  </>
                ) : activeStage.timer_remaining_s != null ? (
                  <button className="btn-ghost text-sm" onClick={timerResume}>
                    {S.timerResume}
                  </button>
                ) : (
                  <button className="btn-ghost text-sm" onClick={() => timerStart(activeStage.config.timer_s ?? 300)}>
                    ⏱ {S.timerStart}
                  </button>
                )}
                <button className="btn-ghost text-sm" onClick={timerReset}>
                  {S.timerStop}
                </button>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            {[...stages]
              .sort((a, b) => a.order_index - b.order_index)
              .map((stage, i, arr) => {
                const isActive = stage.id === meeting.active_stage_id
                return (
                  <div
                    key={stage.id}
                    className={[
                      'card flex items-center gap-3 py-3',
                      isActive ? 'border-coral bg-rose-soft/40' : '',
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
                <div className="font-bold mb-3">{S.addStop}</div>
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
