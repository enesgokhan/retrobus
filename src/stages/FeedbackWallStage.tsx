import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import StageHeader from '../components/StageHeader'
import type { Member, Stage } from '../lib/types'

interface FeedbackItem {
  id: string
  target_member_id: string
  kind: 'strength' | 'growth' | 'kudos'
  body: string
  sort_seed: number
  hidden: boolean
}

const KIND_META = {
  strength: { label: 'Güçlü yön', emoji: '💪', bg: 'bg-teal-soft', border: 'border-teal' },
  growth: { label: 'Gelişim alanı', emoji: '🌱', bg: 'bg-amber-soft', border: 'border-amber' },
  kudos: { label: 'Teşekkür', emoji: '💛', bg: 'bg-rose-soft', border: 'border-coral' },
} as const

/**
 * Geri bildirim duvarı — anonim, TOPLU açılır.
 *
 * Toplu açılış bilinçli: 8 kişilik bir görüntülü görüşmede kartlar tek tek
 * düşerse, kimin yazmak için sustuğuna bakarak yazar tahmin edilir. Toplananlar
 * gizli kalır, şoför açtığında hepsi karışık sırayla birden görünür.
 *
 * `kudos` modu aynı tabloyu kullanır; sadece tek tür ve daha hafif bir dil.
 */
export default function FeedbackWallStage({
  stage,
  presenter = false,
}: {
  stage: Stage
  presenter?: boolean
}) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const kudosOnly = stage.config.mode === 'kudos'

  const [items, setItems] = useState<FeedbackItem[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [target, setTarget] = useState<string>('')
  const [kind, setKind] = useState<'strength' | 'growth' | 'kudos'>(kudosOnly ? 'kudos' : 'strength')
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Şoför tek tek ilerletir; null = herkes birden. */
  const focus = (stage.config.focus_member_id as string | undefined) ?? null

  const isOpen = stage.state === 'open'
  const revealed = stage.state === 'revealed' || stage.state === 'closed'

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      const [{ data: f }, { data: m }] = await Promise.all([
        supabase
          .from('feedback_items')
          .select('id, target_member_id, kind, body, sort_seed, hidden')
          .eq('stage_id', stage.id)
          .order('sort_seed'),
        supabase.from('members').select('id, display_name, is_host').order('display_name'),
      ])
      if (cancelled) return
      setItems((f as FeedbackItem[]) ?? [])
      setMembers((m as Member[]) ?? [])
    }
    load()
    const channel = liveChannel(`fb-${stage.id}`, ['feedback_items', 'stages'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  const others = members.filter((m) => m.id !== member?.id)

  async function send() {
    if (!target || !body.trim() || busy) return
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.rpc('submit_feedback', {
      p_stage_id: stage.id,
      p_target_member_id: target,
      p_kind: kind,
      p_body: body,
    })
    setBusy(false)
    if (e) {
      setError(
        e.message.includes('limit')
          ? 'Bu kişi için bu türde hakkın doldu (en fazla 2).'
          : e.message.includes('yourself') || e.message.includes('about yourself')
            ? 'Kendin hakkında yazamazsın.'
            : 'Gönderilemedi.',
      )
    } else {
      setBody('')
      setSent((n) => n + 1)
    }
  }

  async function toggleHidden(id: string, hidden: boolean) {
    await supabase.from('feedback_items').update({ hidden }).eq('id', id)
  }

  async function setFocus(id: string | null) {
    await supabase
      .from('stages')
      .update({ config: { ...stage.config, focus_member_id: id } })
      .eq('id', stage.id)
  }

  // --- toplama aşaması ---
  if (isOpen) {
    return (
      <div className="w-full max-w-2xl flex flex-col gap-4">
        <StageHeader
          phase={kudosOnly ? 'Teşekkür duvarı' : 'Geri bildirim duvarı'}
          instruction={
            kudosOnly
              ? 'Kime teşekkür etmek istersin? Anonim, hepsi birden açılacak.'
              : 'Takım arkadaşların için yaz. Anonim — hepsi aynı anda, karışık açılacak.'
          }
          progress={sent > 0 ? `${sent} gönderdin` : null}
          presenter={presenter}
        />
        {!presenter && (
          <div className="card flex flex-col gap-3">
            <h3 className="font-extrabold">
              {kudosOnly ? 'Kime teşekkür etmek istersin?' : 'Kim hakkında yazıyorsun?'}
            </h3>
            <select className="input-blob" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— kişi seç —</option>
              {others.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>

            {!kudosOnly && (
              <div className="flex gap-2">
                {(['strength', 'growth'] as const).map((k) => (
                  <button
                    key={k}
                    className={[
                      'flex-1 rounded-2xl border-2 py-2.5 font-bold text-sm transition',
                      kind === k ? `${KIND_META[k].bg} ${KIND_META[k].border}` : 'border-line',
                    ].join(' ')}
                    onClick={() => setKind(k)}
                  >
                    {KIND_META[k].emoji} {KIND_META[k].label}
                  </button>
                ))}
              </div>
            )}

            <textarea
              className="input-blob resize-none"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={kudosOnly ? 'Teşekkürün…' : 'Yazacağın şey…'}
              maxLength={500}
            />
            {error && <p className="text-sm font-semibold text-coral-deep">{error}</p>}
            <button className="btn-coral self-start" onClick={send} disabled={!target || !body.trim() || busy}>
              Gönder
            </button>
            <p className="text-xs font-semibold text-ink-soft">
              🔒 Anonim. Hepsi aynı anda, karışık sırayla açılacak — kimin ne zaman yazdığı
              görünmez. {sent > 0 && `${sent} tane gönderdin.`}
            </p>
          </div>
        )}
        {presenter && (
          <p className="text-center text-2xl font-bold text-ink-soft">
            ✍️ Yazılıyor… {kudosOnly ? 'teşekkürler' : 'geri bildirimler'} toplanıyor
          </p>
        )}
      </div>
    )
  }

  // --- açılış aşaması ---
  const visible = items.filter((i) => isHost || !i.hidden)
  const shown = focus ? visible.filter((i) => i.target_member_id === focus) : visible
  const byTarget = new Map<string, FeedbackItem[]>()
  for (const i of shown) {
    const list = byTarget.get(i.target_member_id) ?? []
    list.push(i)
    byTarget.set(i.target_member_id, list)
  }

  return (
    <div className="w-full max-w-5xl flex flex-col gap-4">
      {isHost && !presenter && (
        <section className="card flex flex-col gap-2">
          <h4 className="font-bold text-sm">Şoför: sırayla göster</h4>
          <div className="flex flex-wrap gap-2">
            <button
              className={[
                'rounded-full px-3 py-1.5 text-sm font-bold border-2',
                focus === null ? 'bg-coral text-white border-coral-deep' : 'border-line',
              ].join(' ')}
              onClick={() => setFocus(null)}
            >
              Herkes
            </button>
            {members.map((m) => {
              const n = visible.filter((i) => i.target_member_id === m.id).length
              return (
                <button
                  key={m.id}
                  className={[
                    'rounded-full px-3 py-1.5 text-sm font-bold border-2',
                    focus === m.id ? 'bg-coral text-white border-coral-deep' : 'border-line',
                    n === 0 ? 'opacity-40' : '',
                  ].join(' ')}
                  onClick={() => setFocus(m.id)}
                >
                  {m.display_name} ({n})
                </button>
              )
            })}
          </div>
        </section>
      )}

      {!revealed ? (
        <p className="text-center text-ink-soft">Şoför duvarı açmayı bekliyor.</p>
      ) : byTarget.size === 0 ? (
        <p className="text-center text-ink-soft">Gösterilecek bir şey yok.</p>
      ) : (
        [...byTarget.entries()].map(([memberId, list]) => (
          <section key={memberId} className="flex flex-col gap-2">
            <h3 className={presenter ? 'text-3xl font-extrabold' : 'text-xl font-extrabold'}>
              {members.find((m) => m.id === memberId)?.display_name ?? '—'}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((i) => {
                const meta = KIND_META[i.kind]
                return (
                  <div
                    key={i.id}
                    className={[
                      'rounded-2xl border-2 p-4 flex flex-col gap-2',
                      i.hidden ? 'border-dashed border-ink-soft/40 opacity-50 bg-card' : `${meta.bg} ${meta.border}`,
                    ].join(' ')}
                  >
                    <span className="text-xs font-bold uppercase tracking-wide opacity-70">
                      {meta.emoji} {meta.label}
                    </span>
                    <p className="whitespace-pre-wrap break-words">{i.body}</p>
                    {isHost && !presenter && (
                      <button
                        className="text-xs text-ink-soft underline self-start"
                        onClick={() => toggleHidden(i.id, !i.hidden)}
                      >
                        {i.hidden ? 'göster' : 'gizle'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
