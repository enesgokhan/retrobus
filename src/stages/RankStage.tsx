import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import StageHeader from '../components/StageHeader'
import Empty from '../components/ui/Empty'
import Alert from '../components/ui/Alert'
import type { Member, Stage } from '../lib/types'

interface Item {
  id: string
  label: string
  order_index: number
}
interface Submission {
  id: string
  ordering: string[]
  sort_seed: number
  member_id: string | null
}

/**
 * Sırala Bakalım (Herd Mentality ailesi).
 *
 * Herkes listeyi gizlice sıralar; açılışta odanın ortak sıralaması çıkar ve
 * SÜRÜYE en yakın olan en çok puanı alır. Bir anket değil, oyun — o yüzden
 * gönderimler isimli: puan tablosu kimin ne sıraladığını bilmeyi gerektiriyor
 * ve "pizza mı lahmacun mu" hassas bir bilgi değil.
 */
export default function RankStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const [items, setItems] = useState<Item[]>([])
  const [subs, setSubs] = useState<Submission[]>([])
  const [order, setOrder] = useState<string[]>([])
  const [mySubmitted, setMySubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  // How many people have ranked. Cannot come from `subs`: RLS hides other
  // people's submissions until reveal — including from the host — so the host's
  // own count read 0 and the reveal button was never offered to them.
  const [submittedCount, setSubmittedCount] = useState(0)

  const isOpen = stage.state === 'open'
  const revealed = stage.state === 'revealed' || stage.state === 'closed'

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      const [{ data: i }, { data: s }, { data: p }, { data: mem }, { data: cnt }] = await Promise.all([
        supabase.from('rank_items').select('id, label, order_index').eq('stage_id', stage.id).order('order_index'),
        supabase.from('rank_submissions').select('id, ordering, sort_seed, member_id').eq('stage_id', stage.id).order('sort_seed'),
        supabase.from('participation').select('action_key, count').eq('stage_id', stage.id),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
        supabase.rpc('answered_count', { p_kind: 'rank', p_id: stage.id }),
      ])
      if (cancelled) return
      const list = (i as Item[]) ?? []
      setItems(list)
      setSubs((s as Submission[]) ?? [])
      setMembers((mem as Member[]) ?? [])
      setSubmittedCount((cnt as number) ?? 0)
      setMySubmitted(
        ((p as { action_key: string; count: number }[]) ?? []).some(
          (r) => r.action_key === 'ranking' && r.count > 0,
        ),
      )
      // seed the local ordering once
      setOrder((prev) => (prev.length === list.length ? prev : list.map((x) => x.id)))
    }
    load()
    const channel = liveChannel(`rank-${stage.id}`, ['rank_items', 'rank_submissions', 'participation', 'stages'], load)
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setOrder(next)
  }

  async function submit() {
    setError(null)
    const { error: e } = await supabase.rpc('submit_ranking', {
      p_stage_id: stage.id,
      p_ordering: order,
    })
    if (e) {
      setError(e.message.includes('limit') ? 'Zaten sıraladın.' : 'Gönderilemedi.')
    } else {
      setMySubmitted(true)
    }
  }

  async function addItem() {
    if (!newLabel.trim()) return
    const at = items.length ? Math.max(...items.map((i) => i.order_index)) + 1 : 1
    await supabase.from('rank_items').insert({ stage_id: stage.id, label: newLabel.trim(), order_index: at })
    setNewLabel('')
  }

  const labelOf = (id: string) => items.find((i) => i.id === id)?.label ?? '—'

  /** Average position across all submissions — the room's consensus order. */
  const consensus = (() => {
    if (!subs.length) return []
    const totals = new Map<string, number>()
    for (const s of subs) {
      s.ordering.forEach((id, pos) => totals.set(id, (totals.get(id) ?? 0) + pos))
    }
    return [...totals.entries()]
      .map(([id, sum]) => ({ id, avg: sum / subs.length }))
      .sort((a, b) => a.avg - b.avg)
  })()

  if (!items.length) {
    return (
      <div className="w-full max-w-2xl flex-1 flex flex-col gap-3">
        <Empty
          icon="🔢"
          title={isHost ? 'Sıralanacak bir şey yok' : 'Liste hazırlanıyor'}
          body={
            isHost
              ? 'Birkaç şey ekle — herkes kendi sırasını yapacak, sürüyle uyum puan getirecek.'
              : 'Liste hazırlanıyor. Sonra herkes kendi sıralamasını yapacak.'
          }
        />
        {isHost && !presenter && (
          <div className="card flex items-center gap-2">
            <input
              className="field flex-1"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Öğe (örn. Pizza)"
              maxLength={100}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
            />
            <button className="btn-filled" onClick={addItem} disabled={!newLabel.trim()}>
              Ekle
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl flex-1 flex flex-col gap-4">
      {error && (
        <Alert>{error}</Alert>
      )}

      <StageHeader
        phase={revealed ? 'Sonuç' : mySubmitted ? 'Gönderildi' : 'Sıralama zamanı'}
        instruction={
          revealed
            ? 'Sürüye en yakın olan en çok puanı aldı.'
            : mySubmitted
              ? 'Sıralaman kayıtlı — diğerlerini bekliyoruz.'
              : 'Listeyi en iyiden en kötüye diz. Çoğunlukla aynı düşünmek puan getirir.'
        }
        waiting={mySubmitted && !revealed}
        progress={`${revealed ? subs.length : submittedCount} sıralama`}
        presenter={presenter}
      />

      {revealed ? (
        <section className="card flex flex-col gap-2">
          <h3 className="font-semibold">Odanın ortak sıralaması ({subs.length} kişi)</h3>
          {consensus.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl border-2 border-sep px-4 py-2.5">
              <span className="w-6 text-right font-semibold text-label-2">{i + 1}</span>
              <span className={['flex-1 min-w-0 truncate', presenter ? 'text-title-3' : 'text-headline'].join(' ')}>
                {labelOf(c.id)}
              </span>
              <span className="text-footnote text-label-2 tabular-nums">ort. {(c.avg + 1).toFixed(1)}</span>
            </div>
          ))}
          {subs.some((x) => x.member_id) && (
            <div className="border-t-2 border-sep pt-2 mt-1 flex flex-col gap-1">
              <h4 className="text-footnote font-bold uppercase tracking-widest text-label-2">Kim ne dedi</h4>
              {subs.filter((x) => x.member_id).map((x) => (
                <div key={x.id} className="text-subhead flex gap-2">
                  <span className="font-bold shrink-0">
                    {members.find((m) => m.id === x.member_id)?.display_name ?? '—'}:
                  </span>
                  <span className="text-label-2 truncate">
                    {x.ordering.map((id) => labelOf(id)).join(' › ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : mySubmitted ? (
        <p className="font-bold text-teal">
          Sıralaman kaydedildi.
        </p>
      ) : isOpen && !presenter ? (
        <section className="flex flex-col gap-3">
          <div className="list-group">
          {order.map((id, i) => (
            <div key={id} className="list-row">
              <span className="w-6 shrink-0 text-right text-label-3 nums">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate text-headline">{labelOf(id)}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className="size-9 rounded-full bg-fill-3 text-label-2 grid place-items-center
                    transition-[background-color,color] duration-150
                    hover:bg-fill-2 hover:text-[--tint] disabled:opacity-25 disabled:hover:bg-fill-3"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Yukarı"
                >
                  <Arrow up />
                </button>
                <button
                  className="size-9 rounded-full bg-fill-3 text-label-2 grid place-items-center
                    transition-[background-color,color] duration-150
                    hover:bg-fill-2 hover:text-[--tint] disabled:opacity-25 disabled:hover:bg-fill-3"
                  disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Aşağı"
                >
                  <Arrow />
                </button>
              </div>
            </div>
          ))}
          </div>
          <button className="btn-filled self-start" onClick={submit}>
            Sıralamamı gönder
          </button>

        </section>
      ) : (
        <p className="text-label-2">
          {presenter ? `${subs.length} kişi sıraladı…` : 'Bu durak henüz açılmadı.'}
        </p>
      )}

      {isHost && !presenter && !revealed && (
        <button
          className="btn-filled self-start"
          onClick={async () => {
            const { error: e } = await supabase.rpc('reveal_ranking', { p_stage_id: stage.id })
            if (e) setError('Açılamadı.')
          }}
        >
          Sonuçları aç ve puanla ({submittedCount} sıralama)
        </button>
      )}

      {isHost && !presenter && !revealed && (
        <div className="card flex items-center gap-2">
          <input
            className="field flex-1"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Öğe ekle"
            maxLength={100}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
          />
          <button className="btn-filled" onClick={addItem} disabled={!newLabel.trim()}>
            Ekle
          </button>
        </div>
      )}
    </div>
  )
}

/** A monochrome arrow that cannot be re-interpreted as an emoji. */
function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={['size-3.5', up ? '' : 'rotate-180'].join(' ')}
      fill="none"
      aria-hidden
    >
      <path
        d="M8 12.5V4M8 4L4 8M8 4l4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
