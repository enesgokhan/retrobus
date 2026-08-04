import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { liveChannel } from '../../lib/realtime'
import QuizAdmin from './QuizAdmin'
import type { Poll } from '../../lib/anon'
import type { Stage, StageConfig } from '../../lib/types'

/**
 * Aktif durağın ayarları + hızlı anket besteci.
 * Kimlik ve açığa-çıkarma modu durak açılmadan önce ayarlanmalı; kartlar
 * yazıldıktan sonra kimliği değiştirmek geçmişe dönük etki etmez.
 */
/** Stage kinds whose setup lives in this panel, so it should open itself. */
const NEEDS_SETUP_PANEL = new Set(['quiz', 'poll'])

export default function StageControls({
  stage,
  needsSetup = false,
  forceOpen = 0,
}: {
  stage: Stage
  needsSetup?: boolean
  /** increment to force the panel open (host pressed "düzelt") */
  forceOpen?: number
}) {
  const sb = supabase
  // Open by default when this stage cannot run until the host does something in
  // here. A quiz with no questions looks identical to a broken app from the
  // room's side, and the setup was previously buried behind a collapsed header.
  const [open, setOpen] = useState(() => needsSetup && NEEDS_SETUP_PANEL.has(stage.kind))

  // reopen if the active stage changes to one that still needs setup
  useEffect(() => {
    if (needsSetup && NEEDS_SETUP_PANEL.has(stage.kind)) setOpen(true)
  }, [stage.id, stage.kind, needsSetup])

  // the host explicitly asked to be taken to the setup
  useEffect(() => {
    if (forceOpen > 0) setOpen(true)
  }, [forceOpen])

  async function patchConfig(patch: Partial<StageConfig>) {
    await sb
      .from('stages')
      .update({ config: { ...stage.config, ...patch } })
      .eq('id', stage.id)
  }

  const identity = stage.config.identity ?? 'anon'
  const reveal = stage.config.reveal ?? 'batch'
  const dots = stage.config.dots ?? 3
  const locked = stage.state !== 'pending'

  return (
    <section className="card flex flex-col gap-3">
      <button
        className="flex items-center justify-between font-bold text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2">
          ⚙️ Durak ayarları
          {needsSetup && (
            <span className="rounded-full bg-amber-soft border border-amber/50 px-2 py-0.5 text-xs font-bold">
              kurulum gerekli
            </span>
          )}
        </span>
        <span className="text-ink-soft">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink-soft">Hatırlatma / yönlendirme metni</span>
            <textarea
              className="input-blob resize-none"
              rows={2}
              defaultValue={stage.config.prompt ?? ''}
              onBlur={(e) => patchConfig({ prompt: e.target.value.trim() || undefined })}
              placeholder="Yolculara ne sormak istiyorsun?"
              maxLength={300}
            />
          </label>

          <div className="grid sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink-soft">Kimlik</span>
              <select
                className="input-blob"
                value={identity}
                disabled={locked}
                onChange={(e) => patchConfig({ identity: e.target.value as 'anon' | 'named' })}
              >
                <option value="anon">Anonim</option>
                <option value="named">İsimli</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink-soft">Kartlar</span>
              <select
                className="input-blob"
                value={reveal}
                onChange={(e) => patchConfig({ reveal: e.target.value as 'batch' | 'live' })}
              >
                <option value="batch">Kapanışta açılsın</option>
                <option value="live">Canlı görünsün</option>
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink-soft">Oy hakkı</span>
              <input
                type="number"
                className="input-blob"
                min={1}
                max={10}
                value={dots}
                onChange={(e) => patchConfig({ dots: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
              />
            </label>
          </div>

          {locked && identity === 'anon' && (
            <p className="text-xs font-semibold text-ink-soft">
              Durak açıldıktan sonra kimlik modu kilitlenir — sonradan değiştirmek zaten yazılmış
              kartları etkilemez, sadece kafa karıştırır.
            </p>
          )}

          {stage.kind === 'poll' && <PollComposer stage={stage} />}
          {stage.kind === 'quiz' && <QuizAdmin stage={stage} />}
          {!NEEDS_SETUP_PANEL.has(stage.kind) && (
            <p className="text-xs font-semibold text-ink-soft">
              Bu durağın kurulumu <strong>Oda</strong> ekranında, durağın kendi üzerinde yapılır —
              tur eklemek, öğe yazmak, takım kurmak için oraya geç.
            </p>
          )}
        </div>
      )}
    </section>
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
    <div className="border-t-2 border-line pt-4 flex flex-col gap-3">
      <div className="font-bold">Hızlı anket</div>
      <input
        className="input-blob"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Soru…"
        maxLength={300}
      />
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-soft">Tür</span>
          <select className="input-blob" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="single">Tek seçim</option>
            <option value="multi">Çok seçim</option>
            <option value="scale5">Ölçek 1-5</option>
            <option value="scale10">Ölçek 1-10</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-soft">Sonuçlar</span>
          <select className="input-blob" value={reveal} onChange={(e) => setReveal(e.target.value as typeof reveal)}>
            <option value="batch">Kapanışta</option>
            <option value="live">Canlı</option>
          </select>
        </label>
      </div>
      {needsOptions && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-soft">Seçenekler (her satır bir seçenek)</span>
          <textarea
            className="input-blob resize-none"
            rows={3}
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
          />
        </label>
      )}
      <button
        className="btn-coral self-start"
        onClick={fire}
        disabled={busy || !question.trim() || (needsOptions && options.length < 2)}
      >
        Anketi aç
      </button>

      {polls.length > 0 && (
        <ul className="flex flex-col gap-2 border-t-2 border-line pt-3">
          {polls.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate font-semibold">{p.question}</span>
              <span className="text-xs text-ink-soft shrink-0">
                {p.state === 'open' ? 'açık' : p.state === 'revealed' ? 'sonuçlar açık' : 'kapalı'}
              </span>
              {p.state === 'open' && (
                <button className="btn-ghost text-xs px-3 py-1" onClick={() => setPollState(p.id, 'revealed')}>
                  Sonuçları göster
                </button>
              )}
              {p.state === 'revealed' && (
                <button className="btn-ghost text-xs px-3 py-1" onClick={() => setPollState(p.id, 'closed')}>
                  Kapat
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
