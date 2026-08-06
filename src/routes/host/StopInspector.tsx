import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { liveChannel } from '../../lib/realtime'
import { S } from '../../lib/strings'
import { stageTheme } from '../../lib/theme'
import QuizAdmin from './QuizAdmin'
import Button from '../../components/ui/Button'
import Segmented from '../../components/ui/Segmented'
import { Field, TextArea } from '../../components/ui/Field'
import { List, Row } from '../../components/ui/List'
import Alert from '../../components/ui/Alert'
import type { Poll } from '../../lib/anon'
import type { Stage, StageConfig } from '../../lib/types'

/** Stop kinds whose setup lives in this panel rather than on the stage screen. */
const SETUP_IN_PANEL = new Set(['quiz', 'poll'])

/**
 * Everything about one stop, in one place.
 *
 * "Hard to configure games" was structurally true, not a matter of polish.
 * A stop's settings lived in a collapsed accordion below the route; its
 * question bank lived inside that accordion; its state controls lived on the
 * route row; its timer lived in a different panel entirely; and for six of the
 * sixteen kinds the setup was on the room screen with no link to it — the
 * console printed the path ("Durak ayarları → Quiz soruları") and left the
 * host to walk it.
 *
 * Select a stop, and this is everything: what it is, what state it is in, the
 * one action that advances it, its settings, its content, and — last, and
 * deliberately far from everything else — how to delete it.
 */
export default function StopInspector({
  stage,
  live,
  needsSetup,
  onActivate,
  onSetState,
  onDelete,
}: {
  stage: Stage
  live: boolean
  needsSetup: string | null
  onActivate: () => void
  onSetState: (state: Stage['state']) => void
  onDelete: () => void
}) {
  const sb = supabase
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [armedAt, setArmedAt] = useState(0)

  async function patchConfig(patch: Partial<StageConfig>) {
    await sb
      .from('stages')
      .update({ config: { ...stage.config, ...patch } })
      .eq('id', stage.id)
  }

  const identity = stage.config.identity ?? 'anon'
  const reveal = stage.config.reveal ?? 'batch'
  const dots = stage.config.dots ?? 3
  const timerMin = Math.round(((stage.config.timer_s as number | undefined) ?? 300) / 60)
  const locked = stage.state !== 'pending'
  const tint = stageTheme(stage.kind).tint

  const stateLabel =
    stage.state === 'pending'
      ? S.stagePending
      : stage.state === 'open'
        ? S.stageOpen
        : stage.state === 'revealed'
          ? S.stageRevealed
          : S.stageClosed

  return (
    <div
      className="flex flex-col gap-6"
      style={{ ['--tint' as string]: tint } as React.CSSProperties}
    >
      {/* what this is, and the one thing to do with it */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-overline uppercase text-label-3">
            {live && <span className="size-2 rounded-full bg-[--tint]" aria-hidden />}
            {S.kind[stage.kind]}
            <span className="text-label-3">· {stateLabel}</span>
          </div>
          <h2 className="text-title-2 mt-1 text-balance">{stage.title}</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!live ? (
            <Button variant="filled" onClick={onActivate}>
              {S.makeActive}
            </Button>
          ) : (
            <>
              {/* One way back. Revealing a board closes writing for good, and
                  on the night somebody is always still typing when the host
                  presses it — without this there is no undo in the run of
                  show. */}
              {(stage.state === 'revealed' || stage.state === 'closed') && (
                <Button
                  onClick={() => onSetState(stage.state === 'closed' ? 'revealed' : 'open')}
                  title="Bir adım geri al"
                >
                  Geri
                </Button>
              )}
              {stage.state === 'pending' && (
                <Button variant="filled" onClick={() => onSetState('open')}>
                  Durağı aç
                </Button>
              )}
              {stage.state === 'open' && (
                <Button variant="filled" onClick={() => onSetState('revealed')}>
                  {S.revealStage}
                </Button>
              )}
              {stage.state === 'revealed' && (
                <Button variant="filled" onClick={() => onSetState('closed')}>
                  {S.closeStage}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {needsSetup && (
        <Alert tone="warn">
          {needsSetup}
          {!SETUP_IN_PANEL.has(stage.kind) && (
            <>
              {' — '}
              <Link to="/oda" className="underline">
                oda ekranında kurulur
              </Link>
            </>
          )}
        </Alert>
      )}

      {/* the question the room sees */}
      <TextArea
        label="Yolculara gösterilecek metin"
        defaultValue={stage.config.prompt ?? ''}
        onBlur={(e) => patchConfig({ prompt: e.target.value.trim() || undefined })}
        placeholder="Yolculara ne sormak istiyorsun?"
        maxLength={300}
        hint="Yazıp başka bir yere tıkla — otomatik kaydedilir."
      />

      {/* settings, as a list rather than three lonely selects in a grid */}
      <List
        title="Ayarlar"
        footer={
          locked && identity === 'anon'
            ? 'Durak açıldıktan sonra kimlik modu kilitlenir — sonradan değiştirmek zaten yazılmış kartları etkilemez, sadece kafa karıştırır.'
            : undefined
        }
      >
        <Row
          title="Kimlik"
          subtitle={identity === 'anon' ? 'Kim yazdığı görünmez' : 'İsimler görünür'}
          trailing={
            <Segmented
              size="sm"
              aria-label="Kimlik"
              value={identity}
              onChange={(v) => !locked && patchConfig({ identity: v })}
              options={[
                { value: 'anon', label: 'Anonim' },
                { value: 'named', label: 'İsimli' },
              ]}
            />
          }
        />
        <Row
          title="Kartlar"
          subtitle={reveal === 'live' ? 'Yazıldıkça görünür' : 'Kapanışta hep birlikte açılır'}
          trailing={
            <Segmented
              size="sm"
              aria-label="Kartlar"
              value={reveal}
              onChange={(v) => patchConfig({ reveal: v })}
              options={[
                { value: 'batch', label: 'Kapanışta' },
                { value: 'live', label: 'Canlı' },
              ]}
            />
          }
        />
        <Row
          title="Oy hakkı"
          subtitle="Kişi başına düşen oy sayısı"
          trailing={
            <input
              type="number"
              className="field w-20 text-center nums"
              min={1}
              max={10}
              value={dots}
              aria-label="Oy hakkı"
              onChange={(e) =>
                patchConfig({ dots: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })
              }
            />
          }
        />
        <Row
          title="Süre"
          subtitle="Sayaç bu süreyle başlar"
          trailing={
            <span className="flex items-center gap-2">
              <input
                type="number"
                className="field w-20 text-center nums"
                min={1}
                max={90}
                value={timerMin}
                aria-label="Süre (dakika)"
                onChange={(e) =>
                  patchConfig({
                    timer_s: Math.max(1, Math.min(90, Number(e.target.value) || 1)) * 60,
                  })
                }
              />
              <span className="text-footnote text-label-3">dk</span>
            </span>
          }
        />
      </List>

      {stage.kind === 'poll' && <PollComposer stage={stage} />}
      {stage.kind === 'quiz' && <QuizAdmin stage={stage} />}

      {!SETUP_IN_PANEL.has(stage.kind) && (
        <p className="text-footnote text-label-3 leading-relaxed">
          Bu durağın içeriği <Link to="/oda" className="text-[--tint] underline">oda ekranında</Link>,
          durağın kendi üzerinde kurulur — tur eklemek, öğe yazmak, takım kurmak için oraya geç.
        </p>
      )}

      {/* Deleting lives at the bottom of the inspector, not on the route row
          where it sat eight pixels from the button the host presses all night
          and destroyed a stop on a single click. */}
      {stage.state === 'pending' && (
        <div className="mt-2 pt-5 border-t border-sep flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-subhead">Durağı sil</div>
            <p className="text-footnote text-label-3">Rotadan tamamen kaldırır.</p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onBlur={() => setConfirmDelete(false)}
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true)
                setArmedAt(Date.now())
                return
              }
              // a two-press confirm must not survive a double-click
              if (Date.now() - armedAt < 700) return
              setConfirmDelete(false)
              onDelete()
            }}
          >
            {confirmDelete ? 'Emin misin? Bas' : S.delete}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Hızlı anket — konuşma sırasında 15 saniyede bir anket açmak için. */
function PollComposer({ stage }: { stage: Stage }) {
  const { member } = useAuth()
  const sb = supabase
  const [question, setQuestion] = useState('')
  const [kind, setKind] = useState<'single' | 'multi' | 'scale5' | 'scale10'>('single')
  const [optionsText, setOptionsText] = useState('Evet\nHayır')
  const [reveal, setReveal] = useState<'batch' | 'live'>('batch')
  const [busy, setBusy] = useState(false)
  const [polls, setPolls] = useState<Poll[]>([])

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      const { data } = await sb
        .from('polls')
        .select('id, stage_id, meeting_id, question, kind, options, reveal, state')
        .eq('stage_id', stage.id)
        .order('created_at')
      if (!cancelled) setPolls((data as Poll[]) ?? [])
    }
    load()
    const channel = liveChannel(`host-polls-${stage.id}`, ['polls'], load)
    return () => {
      cancelled = true
      sb.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, stage.id])

  async function setPollState(id: string, state: Poll['state']) {
    await sb.from('polls').update({ state }).eq('id', id)
  }

  const needsOptions = kind === 'single' || kind === 'multi'
  const options = optionsText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  async function fire() {
    if (!question.trim() || busy) return
    if (needsOptions && options.length < 2) return
    setBusy(true)
    await sb.from('polls').insert({
      stage_id: stage.id,
      meeting_id: stage.meeting_id,
      question: question.trim(),
      kind,
      options: needsOptions ? options : [],
      reveal,
      state: 'open',
    })
    setBusy(false)
    setQuestion('')
  }

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-overline uppercase text-label-3 px-1">Hızlı anket</h3>
      <Field
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Soru…"
        maxLength={300}
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2">
          <span className="text-footnote text-label-2">Tür</span>
          <Segmented
            size="sm"
            aria-label="Tür"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'single', label: 'Tek' },
              { value: 'multi', label: 'Çok' },
              { value: 'scale5', label: '1–5' },
              { value: 'scale10', label: '1–10' },
            ]}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-footnote text-label-2">Sonuçlar</span>
          <Segmented
            size="sm"
            aria-label="Sonuçlar"
            value={reveal}
            onChange={setReveal}
            options={[
              { value: 'batch', label: 'Kapanışta' },
              { value: 'live', label: 'Canlı' },
            ]}
          />
        </label>
      </div>
      {needsOptions && (
        <TextArea
          label="Seçenekler"
          hint="Her satır bir seçenek."
          rows={3}
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
        />
      )}
      <Button
        variant="filled"
        onClick={fire}
        busy={busy}
        disabled={!question.trim() || (needsOptions && options.length < 2)}
      >
        Anketi aç
      </Button>

      {polls.length > 0 && (
        <List title="Bu duraktaki anketler">
          {polls.map((p) => (
            <Row
              key={p.id}
              title={p.question}
              subtitle={
                p.state === 'open' ? 'açık' : p.state === 'revealed' ? 'sonuçlar açık' : 'kapalı'
              }
              trailing={
                p.state === 'open' ? (
                  <Button size="sm" onClick={() => setPollState(p.id, 'revealed')}>
                    Sonuçları göster
                  </Button>
                ) : p.state === 'revealed' ? (
                  <Button size="sm" onClick={() => setPollState(p.id, 'closed')}>
                    Kapat
                  </Button>
                ) : null
              }
            />
          ))}
        </List>
      )}
    </section>
  )
}
