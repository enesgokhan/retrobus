import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { NUMBERS_TR, TEAM_QUESTION_IDEAS, TRIVIA_TR } from '../../content/tr/trivia'
import type { Stage } from '../../lib/types'

interface Row {
  id: string
  kind: 'choice' | 'number'
  prompt: string
  order_index: number
  state: string
}

/**
 * Şoför: quiz sorularını hazırla.
 * Cevaplar `quiz_keys` tablosuna yazılır; RLS onları soru açılana kadar
 * kimseye göstermez, o yüzden hazırlığı toplantıdan önce rahatça yapabilirsin.
 */
export default function QuizAdmin({ stage }: { stage: Stage }) {
  const [rows, setRows] = useState<Row[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [custom, setCustom] = useState({ prompt: '', a: '', b: '', c: '', d: '', correct: 0 })
  const [customNum, setCustomNum] = useState({ prompt: '', answer: '' })

  async function load() {
    const { data } = await supabase
      .from('quiz_questions')
      .select('id, kind, prompt, order_index, state')
      .eq('stage_id', stage.id)
      .order('order_index')
    setRows((data as Row[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [stage.id])

  function nextIndex() {
    return rows.length ? Math.max(...rows.map((r) => r.order_index)) + 1 : 1
  }

  async function addChoice(prompt: string, options: string[], correct: number, at: number) {
    const { data, error } = await supabase
      .from('quiz_questions')
      .insert({
        stage_id: stage.id,
        meeting_id: stage.meeting_id,
        kind: 'choice',
        prompt,
        options,
        order_index: at,
      })
      .select()
      .single()
    if (error || !data) return false
    const { error: kErr } = await supabase
      .from('quiz_keys')
      .insert({ question_id: data.id, correct_index: correct })
    if (kErr) {
      // never leave a question without its answer — it would be unscoreable
      await supabase.from('quiz_questions').delete().eq('id', data.id)
      return false
    }
    return true
  }

  async function addNumber(prompt: string, answer: number, at: number) {
    const { data, error } = await supabase
      .from('quiz_questions')
      .insert({
        stage_id: stage.id,
        meeting_id: stage.meeting_id,
        kind: 'number',
        prompt,
        options: [],
        order_index: at,
      })
      .select()
      .single()
    if (error || !data) return false
    const { error: kErr } = await supabase
      .from('quiz_keys')
      .insert({ question_id: data.id, correct_number: answer })
    if (kErr) {
      await supabase.from('quiz_questions').delete().eq('id', data.id)
      return false
    }
    return true
  }

  async function seed(kind: 'trivia' | 'numbers', count: number) {
    setBusy(true)
    setNote(null)
    let at = nextIndex()
    let added = 0
    if (kind === 'trivia') {
      for (const q of pickRandom(TRIVIA_TR, count)) {
        if (await addChoice(q.prompt, q.options, q.correct, at++)) added++
      }
    } else {
      for (const q of pickRandom(NUMBERS_TR, count)) {
        if (await addNumber(q.prompt, q.answer, at++)) added++
      }
    }
    setBusy(false)
    setNote(`${added} soru eklendi.`)
    load()
  }

  async function addCustomChoice() {
    const opts = [custom.a, custom.b, custom.c, custom.d].map((s) => s.trim()).filter(Boolean)
    if (!custom.prompt.trim() || opts.length < 2) {
      setNote('Soru ve en az 2 seçenek gerekli.')
      return
    }
    if (custom.correct >= opts.length) {
      setNote('Doğru cevap boş bir seçeneği gösteriyor.')
      return
    }
    setBusy(true)
    const ok = await addChoice(custom.prompt.trim(), opts, custom.correct, nextIndex())
    setBusy(false)
    setNote(ok ? 'Soru eklendi.' : 'Eklenemedi.')
    if (ok) setCustom({ prompt: '', a: '', b: '', c: '', d: '', correct: 0 })
    load()
  }

  async function addCustomNumber() {
    const n = Number(customNum.answer.replace(',', '.'))
    if (!customNum.prompt.trim() || !Number.isFinite(n)) {
      setNote('Soru ve sayısal bir cevap gerekli.')
      return
    }
    setBusy(true)
    const ok = await addNumber(customNum.prompt.trim(), n, nextIndex())
    setBusy(false)
    setNote(ok ? 'Soru eklendi.' : 'Eklenemedi.')
    if (ok) setCustomNum({ prompt: '', answer: '' })
    load()
  }

  async function remove(id: string) {
    await supabase.from('quiz_questions').delete().eq('id', id)
    load()
  }

  return (
    <div className="border-t-2 border-line pt-4 flex flex-col gap-4">
      <div className="font-bold">🏆 Quiz soruları ({rows.length})</div>
      {note && <p className="text-sm font-semibold text-ink-soft">{note}</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost text-sm" disabled={busy} onClick={() => seed('trivia', 5)}>
          + 5 genel kültür
        </button>
        <button className="btn-ghost text-sm" disabled={busy} onClick={() => seed('trivia', 10)}>
          + 10 genel kültür
        </button>
        <button className="btn-ghost text-sm" disabled={busy} onClick={() => seed('numbers', 3)}>
          + 3 sayı tahmini
        </button>
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-right text-ink-soft font-bold">{r.order_index}</span>
              <span className="shrink-0" aria-hidden>
                {r.kind === 'number' ? '🔢' : '🔤'}
              </span>
              <span className="flex-1 min-w-0 truncate">{r.prompt}</span>
              <span className="text-xs text-ink-soft shrink-0">
                {r.state === 'draft' ? 'hazır' : r.state === 'open' ? 'açık' : '✓'}
              </span>
              {r.state === 'draft' && (
                <button className="text-xs text-ink-soft underline shrink-0" onClick={() => remove(r.id)}>
                  sil
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-2xl border-2 border-line p-3">
        <summary className="font-bold text-sm cursor-pointer">Kendi sorunu yaz (çoktan seçmeli)</summary>
        <div className="flex flex-col gap-2 mt-3">
          <input
            className="input-blob"
            value={custom.prompt}
            onChange={(e) => setCustom((c) => ({ ...c, prompt: e.target.value }))}
            placeholder="Soru… (örn. Standup’ta en çok kim konuşuyor?)"
            maxLength={400}
          />
          {(['a', 'b', 'c', 'd'] as const).map((k, i) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct"
                className="size-4 accent-teal"
                checked={custom.correct === i}
                onChange={() => setCustom((c) => ({ ...c, correct: i }))}
                aria-label={`${i + 1}. seçenek doğru`}
              />
              <input
                className="input-blob flex-1"
                value={custom[k]}
                onChange={(e) => setCustom((c) => ({ ...c, [k]: e.target.value }))}
                placeholder={`${i + 1}. seçenek${i > 1 ? ' (isteğe bağlı)' : ''}`}
                maxLength={120}
              />
            </label>
          ))}
          <p className="text-xs text-ink-soft">Yuvarlağı işaretlediğin seçenek doğru cevaptır.</p>
          <button className="btn-coral self-start text-sm" disabled={busy} onClick={addCustomChoice}>
            Ekle
          </button>
          <p className="text-xs text-ink-soft border-t border-line pt-2 mt-1">
            Fikir: {TEAM_QUESTION_IDEAS.slice(0, 3).join(' · ')}
          </p>
        </div>
      </details>

      <details className="rounded-2xl border-2 border-line p-3">
        <summary className="font-bold text-sm cursor-pointer">Kendi sorunu yaz (sayı tahmini)</summary>
        <div className="flex flex-col gap-2 mt-3">
          <input
            className="input-blob"
            value={customNum.prompt}
            onChange={(e) => setCustomNum((c) => ({ ...c, prompt: e.target.value }))}
            placeholder="Soru… (örn. Bu yıl kaç PR merge ettik?)"
            maxLength={400}
          />
          <input
            className="input-blob"
            value={customNum.answer}
            onChange={(e) => setCustomNum((c) => ({ ...c, answer: e.target.value }))}
            placeholder="Doğru sayı"
            inputMode="decimal"
          />
          <button className="btn-coral self-start text-sm" disabled={busy} onClick={addCustomNumber}>
            Ekle
          </button>
        </div>
      </details>
    </div>
  )
}

/** Deterministic-enough shuffle-and-take; order only affects which get seeded. */
function pickRandom<T>(pool: T[], n: number): T[] {
  const copy = [...pool]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, Math.min(n, copy.length))
}
