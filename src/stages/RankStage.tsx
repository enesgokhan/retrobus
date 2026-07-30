import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import StageHeader from '../components/StageHeader'
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
      <div className="w-full max-w-2xl flex flex-col gap-3">
        <p className="text-center text-ink-soft">
          {isHost ? 'Sıralanacak öğe yok — aşağıdan ekle.' : 'Şoför listeyi hazırlıyor…'}
        </p>
        {isHost && !presenter && (
          <div className="card flex items-center gap-2">
            <input
              className="input-blob flex-1"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Öğe (örn. Pizza)"
              maxLength={100}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
            />
            <button className="btn-coral" onClick={addItem} disabled={!newLabel.trim()}>
              Ekle
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
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
        progress={`${subs.length} sıralama`}
        presenter={presenter}
      />

      {revealed ? (
        <section className="card flex flex-col gap-2">
          <h3 className="font-extrabold">Odanın ortak sıralaması ({subs.length} kişi)</h3>
          {consensus.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl border-2 border-line px-4 py-2.5">
              <span className="w-6 text-right font-extrabold text-ink-soft">{i + 1}</span>
              <span className={['flex-1 font-bold', presenter ? 'text-2xl' : ''].join(' ')}>
                {labelOf(c.id)}
              </span>
              <span className="text-xs text-ink-soft tabular-nums">ort. {(c.avg + 1).toFixed(1)}</span>
            </div>
          ))}
          {subs.some((x) => x.member_id) && (
            <div className="border-t-2 border-line pt-2 mt-1 flex flex-col gap-1">
              <h4 className="text-xs font-bold uppercase tracking-widest text-ink-soft">Kim ne dedi</h4>
              {subs.filter((x) => x.member_id).map((x) => (
                <div key={x.id} className="text-sm flex gap-2">
                  <span className="font-bold shrink-0">
                    {members.find((m) => m.id === x.member_id)?.display_name ?? '—'}:
                  </span>
                  <span className="text-ink-soft truncate">
                    {x.ordering.map((id) => labelOf(id)).join(' › ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : mySubmitted ? (
        <p className="text-center font-bold text-teal">
          ✅ Sıralaman kaydedildi.
        </p>
      ) : isOpen && !presenter ? (
        <section className="card flex flex-col gap-2">
          <h3 className="font-extrabold mb-1">En iyiden en kötüye sırala</h3>
          {order.map((id, i) => (
            <div key={id} className="flex items-center gap-2 rounded-2xl border-2 border-line px-3 py-2">
              <span className="w-5 text-right font-bold text-ink-soft">{i + 1}</span>
              <span className="flex-1 font-bold truncate">{labelOf(id)}</span>
              <div className="flex flex-col">
                <button
                  className="text-ink-soft disabled:opacity-20 leading-none"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Yukarı"
                >
                  ▲
                </button>
                <button
                  className="text-ink-soft disabled:opacity-20 leading-none"
                  disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Aşağı"
                >
                  ▼
                </button>
              </div>
            </div>
          ))}
          <button className="btn-coral self-start mt-2" onClick={submit}>
            Sıralamamı gönder
          </button>
          <p className="text-xs font-semibold text-ink-soft">
            🔒 Gönderdiklerin açılışa kadar gizli. Sürüyle uyum puan getirir.
          </p>
        </section>
      ) : (
        <p className="text-center text-ink-soft">
          {presenter ? `${subs.length} kişi sıraladı…` : 'Şoför bu durağı açmayı bekliyor.'}
        </p>
      )}

      {isHost && !presenter && !revealed && (
        <button
          className="btn-coral self-center"
          onClick={async () => {
            const { error: e } = await supabase.rpc('reveal_ranking', { p_stage_id: stage.id })
            if (e) setError('Açılamadı.')
          }}
        >
          🐄 Sonuçları aç ve puanla ({submittedCount} sıralama)
        </button>
      )}

      {isHost && !presenter && !revealed && (
        <div className="card flex items-center gap-2">
          <input
            className="input-blob flex-1"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Öğe ekle"
            maxLength={100}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
          />
          <button className="btn-coral" onClick={addItem} disabled={!newLabel.trim()}>
            Ekle
          </button>
        </div>
      )}
    </div>
  )
}
