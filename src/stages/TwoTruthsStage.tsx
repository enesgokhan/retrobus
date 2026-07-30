import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { liveChannel } from '../lib/realtime'
import { useAuth } from '../lib/auth'
import type { Member, Stage } from '../lib/types'

interface Entry {
  id: string
  stage_id: string
  member_id: string
  s1: string
  s2: string
  s3: string
  revealed: boolean
}
interface Guess {
  entry_id: string
  guesser_member_id: string
  guess_index: number
}
interface Key {
  entry_id: string
  lie_index: number
}

/**
 * İki Doğru Bir Yalan.
 * Akış: herkes 3 cümle + yalanı yazar (durak açık) → şoför sırayla bir kişinin
 * kartını seçer → oda yalanı tahmin eder → şoför açar, puanlar düşer.
 * Doğru tahmin +2, kandırdığın her kişi için +1.
 * Yalan `two_truths_keys` tablosunda; RLS onu açılana kadar kimseye vermez.
 */
export default function TwoTruthsStage({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const { member } = useAuth()
  const isHost = member?.is_host ?? false
  const [entries, setEntries] = useState<Entry[]>([])
  const [guesses, setGuesses] = useState<Guess[]>([])
  const [keys, setKeys] = useState<Key[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [form, setForm] = useState({ s1: '', s2: '', s3: '', lie: 0 })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isOpen = stage.state === 'open'
  const currentId = (stage.config.current_entry_id as string | undefined) ?? null
  const mine = entries.find((e) => e.member_id === member?.id) ?? null
  const current = entries.find((e) => e.id === currentId) ?? null

  useEffect(() => {
    if (!member) return
    let cancelled = false
    async function load() {
      // Entries first, then guesses/keys scoped to them. Unfiltered child
      // queries would span every meeting and hit PostgREST's 1000-row cap.
      const [{ data: e }, { data: m }] = await Promise.all([
        supabase.from('two_truths_entries').select('*').eq('stage_id', stage.id),
        supabase.from('members').select('id, display_name, is_host, avatar').order('display_name'),
      ])
      if (cancelled) return
      const entryList = (e as Entry[]) ?? []
      setEntries(entryList)
      setMembers((m as Member[]) ?? [])

      const entryIds = entryList.map((x) => x.id)
      if (!entryIds.length) {
        setGuesses([])
        setKeys([])
        return
      }
      const [{ data: g }, { data: k }] = await Promise.all([
        supabase.from('two_truths_guesses').select('entry_id, guesser_member_id, guess_index')
          .in('entry_id', entryIds),
        supabase.from('two_truths_keys').select('entry_id, lie_index').in('entry_id', entryIds),
      ])
      if (cancelled) return
      setGuesses((g as Guess[]) ?? [])
      setKeys((k as Key[]) ?? [])
    }
    load()
    const channel = liveChannel(
      `tt-${stage.id}`,
      ['two_truths_entries', 'two_truths_guesses', 'stages'],
      load,
    )
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [member, stage.id])

  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? '—'

  async function submitMine() {
    if (busy) return
    const { s1, s2, s3, lie } = form
    if (!s1.trim() || !s2.trim() || !s3.trim() || !lie) {
      setError('Üç cümleyi de yaz ve yalanı seç.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.rpc('submit_two_truths', {
      p_stage_id: stage.id,
      p_s1: s1,
      p_s2: s2,
      p_s3: s3,
      p_lie_index: lie,
    })
    setBusy(false)
    if (e) setError('Kaydedilemedi, tekrar dene.')
  }

  async function guess(entryId: string, idx: number) {
    setError(null)
    const { error: e } = await supabase.rpc('guess_two_truths', {
      p_entry_id: entryId,
      p_guess_index: idx,
    })
    if (e) setError(e.message.includes('own') ? 'Kendi kartını tahmin edemezsin.' : 'Tahmin kaydedilemedi.')
  }

  async function setCurrent(entryId: string | null) {
    await supabase
      .from('stages')
      .update({ config: { ...stage.config, current_entry_id: entryId } })
      .eq('id', stage.id)
  }

  async function reveal(entryId: string) {
    const { error: e } = await supabase.rpc('reveal_two_truths', { p_entry_id: entryId })
    if (e) setError('Açılamadı.')
  }

  // --- authoring phase ---
  if (isOpen && !presenter && !mine) {
    return (
      <div className="card w-full max-w-lg flex flex-col gap-3">
        <h3 className="font-extrabold">Üç cümle yaz — biri yalan olsun</h3>
        {([1, 2, 3] as const).map((n) => (
          <label key={n} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, lie: n }))}
              className={[
                'shrink-0 size-9 rounded-full border-2 font-bold text-sm transition',
                form.lie === n ? 'bg-coral text-white border-coral-deep' : 'border-line text-ink-soft',
              ].join(' ')}
              title="Yalan bu"
              aria-label={`${n}. cümle yalan`}
            >
              {form.lie === n ? '🤥' : n}
            </button>
            <input
              className="input-blob flex-1"
              value={form[`s${n}` as 's1' | 's2' | 's3']}
              onChange={(e) => setForm((f) => ({ ...f, [`s${n}`]: e.target.value }))}
              placeholder={`${n}. cümle`}
              maxLength={200}
            />
          </label>
        ))}
        <p className="text-xs font-semibold text-ink-soft">
          Soldaki yuvarlağa basarak hangisinin yalan olduğunu işaretle. Kimse göremez.
        </p>
        {error && <p className="text-sm font-semibold text-coral-deep">{error}</p>}
        <button className="btn-coral self-start" onClick={submitMine} disabled={busy}>
          Gönder
        </button>
      </div>
    )
  }

  // --- waiting / guessing / reveal ---
  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-2xl bg-rose-soft text-coral-deep px-4 py-2.5 text-sm font-semibold">
          {error}
        </p>
      )}

      {isOpen && mine && !current && (
        <p className="text-center text-ink-soft font-semibold">
          ✅ Cümlelerin kayıtlı. {entries.length}/{members.length} kişi yazdı — şoförü bekliyoruz.
        </p>
      )}

      {current ? (
        <EntryCard
          entry={current}
          name={nameOf(current.member_id)}
          lie={keys.find((k) => k.entry_id === current.id)?.lie_index ?? null}
          guesses={guesses.filter((g) => g.entry_id === current.id)}
          myGuess={guesses.find((g) => g.entry_id === current.id && g.guesser_member_id === member?.id)}
          isMine={current.member_id === member?.id}
          presenter={presenter}
          nameOf={nameOf}
          onGuess={(i) => guess(current.id, i)}
        />
      ) : (
        !isOpen && <p className="text-center text-ink-soft">Şoför bir kart seçmeyi bekliyor.</p>
      )}

      {isHost && !presenter && (
        <section className="card flex flex-col gap-2">
          <h4 className="font-bold text-sm">Şoför: kart seç</h4>
          <div className="flex flex-wrap gap-2">
            {entries.map((e) => (
              <button
                key={e.id}
                className={[
                  'rounded-full px-3 py-1.5 text-sm font-bold border-2',
                  e.id === currentId ? 'bg-coral text-white border-coral-deep' : 'border-line',
                  e.revealed ? 'opacity-50' : '',
                ].join(' ')}
                onClick={() => setCurrent(e.id)}
              >
                {nameOf(e.member_id)} {e.revealed ? '✓' : ''}
              </button>
            ))}
            {currentId && (
              <button className="btn-ghost text-sm" onClick={() => setCurrent(null)}>
                Kartı kaldır
              </button>
            )}
          </div>
          {current && !current.revealed && (
            <button className="btn-coral self-start" onClick={() => reveal(current.id)}>
              🤥 Yalanı aç ve puanla ({guesses.filter((g) => g.entry_id === current.id).length} tahmin)
            </button>
          )}
        </section>
      )}
    </div>
  )
}

function EntryCard({
  entry,
  name,
  lie,
  guesses,
  myGuess,
  isMine,
  presenter,
  nameOf,
  onGuess,
}: {
  entry: Entry
  name: string
  lie: number | null
  guesses: Guess[]
  myGuess?: Guess
  isMine: boolean
  presenter: boolean
  nameOf: (id: string) => string
  onGuess: (i: number) => void
}) {
  const statements = [entry.s1, entry.s2, entry.s3]
  const revealed = entry.revealed

  return (
    <section className="card flex flex-col gap-3">
      <h3 className={presenter ? 'text-3xl font-extrabold' : 'text-xl font-extrabold'}>
        {name} — hangisi yalan?
      </h3>
      {statements.map((s, i) => {
        const n = i + 1
        const votes = guesses.filter((g) => g.guess_index === n)
        const isLie = revealed && lie === n
        const picked = myGuess?.guess_index === n
        const canGuess = !revealed && !isMine && !presenter

        return (
          <button
            key={n}
            className={[
              'text-left rounded-2xl border-2 px-4 py-3 transition',
              isLie ? 'bg-rose-soft border-coral' : revealed ? 'bg-teal-soft/50 border-teal' : 'border-line',
              picked && !revealed ? 'border-coral' : '',
              canGuess ? 'hover:border-coral cursor-pointer' : 'cursor-default',
            ].join(' ')}
            onClick={() => canGuess && onGuess(n)}
            disabled={!canGuess}
          >
            <div className="flex items-start justify-between gap-3">
              <span className={presenter ? 'text-xl' : ''}>
                {revealed && (isLie ? '🤥 ' : '✅ ')}
                {s}
              </span>
              {picked && !revealed && <span className="text-xs font-bold text-coral shrink-0">senin tahminin</span>}
            </div>
            {revealed && votes.length > 0 && (
              <p className="text-xs font-semibold text-ink-soft mt-1.5">
                {votes.map((v) => nameOf(v.guesser_member_id)).join(', ')}
              </p>
            )}
          </button>
        )
      })}
      {isMine && !revealed && (
        <p className="text-xs font-semibold text-ink-soft">Bu senin kartın — tahmin edemezsin.</p>
      )}
      {!revealed && !isMine && !myGuess && !presenter && (
        <p className="text-xs font-semibold text-ink-soft">Bir cümleye bas.</p>
      )}
    </section>
  )
}
