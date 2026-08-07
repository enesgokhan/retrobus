import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useMeeting } from '../../lib/useMeeting'
import { S } from '../../lib/strings'
import AppShell from '../../components/AppShell'
import type { Stage } from '../../lib/types'
import { AGENDA_MINUTES, DEFAULT_AGENDA, STAGE_PRESETS } from '../../lib/presets'
import StopPicker from './StopPicker'
import NowBar from './NowBar'
import RunOfShow from './RunOfShow'
import StopInspector from './StopInspector'
import { useStageReadiness } from '../../lib/useStageReadiness'
import { usePresence } from '../../lib/usePresence'
import PresenceBar from '../../components/PresenceBar'
import JoinPanel from '../../components/JoinPanel'
import Button from '../../components/ui/Button'
import Segmented from '../../components/ui/Segmented'
import Sheet from '../../components/ui/Sheet'
import Empty from '../../components/ui/Empty'
import Alert from '../../components/ui/Alert'
import { Field, TextArea } from '../../components/ui/Field'
import Icon from '../../components/ui/Icon'

/**
 * Şoför konsolu.
 *
 * Rebuilt as a cockpit rather than a column of panels. The old console stacked
 * six unrelated cards down the left (now/next, presence, join code, welcome
 * note, freeze, end) and seventeen individually-bordered agenda cards down the
 * right, and scrolled to 2300px. Nothing was where you would look for it twice
 * running, and a stop's configuration was scattered across four of those
 * panels plus, for most kinds, a different screen entirely.
 *
 * Three zones now, and they map to the three questions the host actually has:
 *
 *   ŞU AN      what is live, how long is left, what do I press — pinned at the
 *              top so it is answerable without scrolling, all evening.
 *   ROTA       the run of show, as one list. Select to inspect, jump to drive.
 *   MÜFETTİŞ   everything about the selected stop, in one place. The second tab
 *              holds what belongs to the MEETING rather than to a stop.
 */
export default function Host() {
  const { meeting, stages, activeStage, loading } = useMeeting()
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const readiness = useStageReadiness(stages)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pane, setPane] = useState<'stop' | 'room'>('stop')
  const [confirmEnd, setConfirmEnd] = useState(false)
  /**
   * When the confirm was armed. A two-press confirm does not survive a
   * double-click: both presses land, and ending the night is not undoable from
   * anywhere in the app. The second press has to be a decision, not a bounce.
   */
  const [armedAt, setArmedAt] = useState(0)
  /** the console's own voice — writes that fail must say so */
  const [hostError, setHostError] = useState<string | null>(null)
  const here = usePresence(meeting?.id ?? null)
  const [freezeNote, setFreezeNote] = useState('')
  const sb = supabase

  const sorted = useMemo(
    () => [...stages].sort((a, b) => a.order_index - b.order_index),
    [stages],
  )

  // The inspector follows the meeting unless the host has pointed it somewhere
  // else: land on what is live, fall back to what is next.
  useEffect(() => {
    if (selectedId && sorted.some((s) => s.id === selectedId)) return
    setSelectedId(activeStage?.id ?? sorted[0]?.id ?? null)
  }, [activeStage?.id, sorted, selectedId])

  const selected = sorted.find((s) => s.id === selectedId) ?? null

  /**
   * Freezing is the panic button: it is pressed because something needs to stop
   * right now. A silent failure here is the worst case in the console — the
   * host cannot tell a failed write from a slow one, and keeps talking while
   * nine screens carry on showing whatever they were showing.
   */
  async function toggleFreeze() {
    if (!meeting) return
    const { error } = await sb
      .from('meetings')
      .update({ frozen: !meeting.frozen, frozen_note: freezeNote.trim() || null })
      .eq('id', meeting.id)
    setHostError(error ? 'Ekranlar dondurulamadı — tekrar dene.' : null)
  }

  async function createMeeting() {
    if (!newTitle.trim()) return
    // Exactly one meeting is live at a time. Without this the app quietly
    // accumulates live meetings, everyone follows whichever is newest, and
    // archiving the current one drops the whole room back into an older night.
    await sb.from('meetings').update({ status: 'done', active_stage_id: null }).eq('status', 'live')
    const { error } = await sb.from('meetings').insert({ title: newTitle.trim(), status: 'live' })
    if (error) setHostError('Toplantı açılamadı — tekrar dene.')
    else setNewTitle('')
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
    if (!confirmEnd) {
      setConfirmEnd(true)
      setArmedAt(Date.now())
      return
    }
    if (Date.now() - armedAt < 700) return // a double-click, not an answer
    setConfirmEnd(false)
    const { error } = await sb
      .from('meetings')
      .update({ status: 'done', active_stage_id: null })
      .eq('id', meeting.id)
    if (error) setHostError('Toplantı arşivlenemedi — tekrar dene.')
  }

  function nextOrder() {
    return stages.length ? Math.max(...stages.map((s) => s.order_index)) + 1 : 1
  }

  /** Hazır 3 saatlik rotayı tek seferde kur. */
  async function seedAgenda() {
    if (!meeting) return
    let order = nextOrder()
    const rows = DEFAULT_AGENDA.flatMap((entry) => {
      const preset = STAGE_PRESETS.find((p) => p.key === entry.preset)
      if (!preset) return []
      return [
        {
          meeting_id: meeting.id,
          kind: preset.kind,
          title: preset.title,
          order_index: order++,
          config: { ...preset.config, timer_s: entry.minutes * 60 },
        },
      ]
    })
    const { error } = await sb.from('stages').insert(rows)
    if (error) setHostError('Rota kurulamadı — tekrar dene.')
    setAdding(false)
  }

  async function addPreset(presetKey: string) {
    if (!meeting) return
    const preset = STAGE_PRESETS.find((p) => p.key === presetKey)
    if (!preset) return
    const { data, error } = await sb
      .from('stages')
      .insert({
        meeting_id: meeting.id,
        kind: preset.kind,
        title: preset.title,
        order_index: nextOrder(),
        config: preset.config,
      })
      .select('id')
      .single()
    if (error) setHostError('Durak eklenemedi — tekrar dene.')
    setAdding(false)
    // land on what you just made, so adding and configuring are one motion
    if (data?.id) {
      setSelectedId(data.id as string)
      setPane('stop')
    }
  }

  async function move(stage: Stage, dir: -1 | 1) {
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
      await sb
        .from('stages')
        .update({ state: 'open', opened_at: new Date().toISOString() })
        .eq('id', stage.id)
    }
    setSelectedId(stage.id)
  }

  async function setState(stage: Stage, state: Stage['state']) {
    setHostError(null)
    // Rank These is scored by a function, not by the state column. Setting
    // state='revealed' directly opened the results with nobody scored — and
    // RankStage only renders its own scoring button while NOT revealed, so the
    // points became permanently unreachable. reveal_ranking scores and sets the
    // state itself, so the console's big button must go through it.
    if (state === 'revealed' && stage.kind === 'rank') {
      const { error } = await sb.rpc('reveal_ranking', { p_stage_id: stage.id })
      if (!error) return
    }
    const { error } = await sb.from('stages').update({ state }).eq('id', stage.id)
    if (error) setHostError('Durak durumu değiştirilemedi — tekrar dene.')
  }

  async function removeStage(stage: Stage) {
    const { error } = await sb.from('stages').delete().eq('id', stage.id)
    if (error) setHostError('Durak silinemedi — tekrar dene.')
  }

  // --- shared countdown controls (on the active stage) ---
  async function timerStart(seconds: number) {
    if (!activeStage) return
    const ends = new Date(Date.now() + seconds * 1000).toISOString()
    await sb
      .from('stages')
      .update({ timer_ends_at: ends, timer_remaining_s: null })
      .eq('id', activeStage.id)
  }
  async function timerPause() {
    if (!activeStage?.timer_ends_at) return
    const left = Math.max(
      0,
      Math.round((new Date(activeStage.timer_ends_at).getTime() - Date.now()) / 1000),
    )
    await sb
      .from('stages')
      .update({ timer_ends_at: null, timer_remaining_s: left })
      .eq('id', activeStage.id)
  }
  async function timerResume() {
    if (!activeStage || activeStage.timer_remaining_s == null) return
    await timerStart(activeStage.timer_remaining_s)
  }
  async function timerPlus() {
    if (!activeStage?.timer_ends_at) return
    // Extend from NOW if it has already run out. Adding a minute to a deadline
    // that passed six minutes ago leaves it in the past, so the clock stayed at
    // a pulsing 0:00 on every screen and the host had to press this once for
    // each minute already elapsed before anything moved.
    const base = Math.max(new Date(activeStage.timer_ends_at).getTime(), Date.now())
    const ends = new Date(base + 60_000).toISOString()
    const { error } = await sb.from('stages').update({ timer_ends_at: ends }).eq('id', activeStage.id)
    if (error) setHostError('Süre uzatılamadı — tekrar dene.')
  }

  if (loading) {
    return (
      <AppShell title={S.hostConsole} width="full">
        <p className="text-subhead text-label-2">{S.loading}</p>
      </AppShell>
    )
  }

  // No live meeting: the console's whole job is to start one.
  if (!meeting) {
    return (
      <AppShell title={S.hostConsole} width="reading">
        {hostError && <Alert>{hostError}</Alert>}
        <div className="card-lg mt-2">
          <Empty
            icon={<Icon name="bus" size={44} />}
            title={S.newMeeting}
            body="Bir isim ver ve başlat. Rotayı sonra kurarsın."
            action={
              <div className="flex flex-col gap-3 w-full max-w-sm">
                <Field
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void createMeeting()}
                  placeholder={S.meetingTitlePlaceholder}
                  autoFocus
                />
                <Button variant="filled" block onClick={createMeeting} disabled={!newTitle.trim()}>
                  {S.goLive}
                </Button>
              </div>
            }
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      title={S.hostConsole}
      subtitle={meeting.title}
      width="full"
      actions={
        <Link to="/sunum" className="btn-gray btn-md">
          Sunum ekranı
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        {hostError && <Alert>{hostError}</Alert>}

        <NowBar
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
          onFixSetup={(s) => {
            setSelectedId(s.id)
            setPane('stop')
          }}
        />

        {sorted.length === 0 ? (
          /* An empty route is where "hard to start" actually lived: the one
             thing a new host should press was a small link inside a picker
             they had to open first. It is now the thing they land on. */
          <div className="card-lg">
            <Empty
              size="lg"
              icon={<Icon name="route" size={44} />}
              title="Rota boş"
              body={`Hazır rota ${DEFAULT_AGENDA.length} durak, ~${Math.round(
                AGENDA_MINUTES / 60,
              )} saat (${AGENDA_MINUTES} dk): yaklaşık bir saat tartışma, iki saat oyun. İstemediğin durağı sonra silersin.`}
              action={
                <>
                  <Button variant="filled" size="lg" onClick={seedAgenda}>
                    Hazır rotayı kur
                  </Button>
                  <Button size="lg" onClick={() => setAdding(true)}>
                    Kendim seçeyim
                  </Button>
                </>
              }
            />
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] xl:items-start">
            {/* rota */}
            <section className="flex flex-col gap-3 min-w-0 xl:sticky xl:top-20">
              <div className="flex items-center justify-between gap-3 px-1">
                <h2 className="text-overline uppercase text-label-3">
                  Rota <span className="text-label-3 nums">{sorted.length}</span>
                </h2>
                <Button size="sm" variant="plain" onClick={() => setAdding(true)}>
                  ＋ {S.addStop}
                </Button>
              </div>
              <div className="xl:max-h-[calc(100dvh-13rem)] xl:overflow-y-auto xl:-mr-1 xl:pr-1">
                <RunOfShow
                  stages={sorted}
                  activeId={meeting.active_stage_id}
                  selectedId={selectedId}
                  readiness={readiness}
                  onSelect={(s) => {
                    setSelectedId(s.id)
                    setPane('stop')
                  }}
                  onActivate={activate}
                  onMove={move}
                />
              </div>
            </section>

            {/* müfettiş */}
            <section className="min-w-0 flex flex-col gap-4">
              <Segmented
                aria-label="Panel"
                value={pane}
                onChange={setPane}
                options={[
                  { value: 'stop', label: 'Durak' },
                  { value: 'room', label: 'Oda' },
                ]}
              />

              <div className="card-lg min-h-[24rem]">
                {pane === 'stop' ? (
                  selected ? (
                    <StopInspector
                      key={selected.id}
                      stage={selected}
                      live={selected.id === meeting.active_stage_id}
                      needsSetup={readiness[selected.id]?.todo ?? null}
                      onActivate={() => activate(selected)}
                      onSetState={(st) => setState(selected, st)}
                      onDelete={() => void removeStage(selected)}
                    />
                  ) : (
                    <Empty title="Bir durak seç" body="Soldaki rotadan bir durağa tıkla." />
                  )
                ) : (
                  <RoomPane
                    meeting={meeting}
                    here={here}
                    freezeNote={freezeNote}
                    onFreezeNote={setFreezeNote}
                    onToggleFreeze={toggleFreeze}
                    confirmEnd={confirmEnd}
                    onEnd={endMeeting}
                    onClearConfirm={() => setConfirmEnd(false)}
                  />
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={S.addStop}
        subtitle="Akşamın hangi bölümüne ait olduğuna göre gruplandı."
        size="lg"
      >
        <StopPicker onPick={(k) => void addPreset(k)} onCancel={() => setAdding(false)} />
      </Sheet>
    </AppShell>
  )
}

/**
 * What belongs to the MEETING rather than to a stop: who is here, how they get
 * in, what greets them, and the two switches that stop the night.
 */
function RoomPane({
  meeting,
  here,
  freezeNote,
  onFreezeNote,
  onToggleFreeze,
  confirmEnd,
  onEnd,
  onClearConfirm,
}: {
  meeting: NonNullable<ReturnType<typeof useMeeting>['meeting']>
  here: Set<string>
  freezeNote: string
  onFreezeNote: (v: string) => void
  onToggleFreeze: () => void
  confirmEnd: boolean
  onEnd: () => void
  onClearConfirm: () => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <PresenceBar here={here} />
      <JoinPanel meeting={meeting} compact />

      <TextArea
        label="Karşılama mesajı"
        defaultValue={meeting.welcome_note ?? ''}
        placeholder={
          'örn. Hoş geldiniz! Bugün 3 saat boyunca hem konuşacağız hem oynayacağız.\nTelefonunu yanında tut, sırayla ilerleyeceğiz.'
        }
        maxLength={1000}
        rows={4}
        hint={
          meeting.welcome_note
            ? 'Herkese giriş yaptıktan sonra bir kez gösterilir. Yazıp başka bir yere tıkla — otomatik kaydedilir.'
            : 'Boş — kimseye gösterilmiyor. Herkese giriş yaptıktan sonra bir kez gösterilir.'
        }
        onBlur={async (e) => {
          const v = e.target.value.trim()
          await supabase
            .from('meetings')
            .update({ welcome_note: v || null })
            .eq('id', meeting.id)
        }}
      />

      <div className="flex flex-col gap-3 pt-5 border-t border-sep">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-subhead">Ekranları dondur</div>
            <p className="text-footnote text-label-3">
              Herkesin ekranı bir nota döner. Ara vermek ya da dikkat toplamak için.
            </p>
          </div>
          <Button variant={meeting.frozen ? 'filled' : 'gray'} onClick={onToggleFreeze}>
            {meeting.frozen ? S.unfreeze : S.freeze}
          </Button>
        </div>
        {!meeting.frozen && (
          <Field
            value={freezeNote}
            onChange={(e) => onFreezeNote(e.target.value)}
            placeholder="Dondurunca gösterilecek not (isteğe bağlı)"
            maxLength={200}
          />
        )}
        {meeting.frozen && <Alert tone="warn">Tüm ekranlar donduruldu.</Alert>}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap pt-5 border-t border-sep">
        <div className="min-w-0">
          <div className="text-subhead">Toplantıyı bitir</div>
          <p className="text-footnote text-label-3">
            Arşive kaldırır. Yıllık okunmaya devam eder, konsol yeni bir toplantıya hazır olur.
          </p>
        </div>
        <Button variant="danger" onClick={onEnd} onBlur={onClearConfirm}>
          {confirmEnd ? 'Emin misin? Bas' : 'Bitir ve arşivle'}
        </Button>
      </div>
    </div>
  )
}
