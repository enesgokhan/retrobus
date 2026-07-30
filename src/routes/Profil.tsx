import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { S } from '../lib/strings'

const AVATARS = [
  '🚌', '🦊', '🐼', '🐙', '🦉', '🐝', '🦔', '🐧',
  '🦁', '🐳', '🦄', '🐢', '🦋', '🐨', '🦩', '🐺',
  '🍕', '🌮', '🍩', '☕', '🎸', '🚀', '⚡', '🌵',
]

/** Profil — avatar seç, kendi kodunu değiştir. */
export default function Profil() {
  const { member, patchMember } = useAuth()
  const [avatar, setAvatar] = useState(member?.avatar ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  function say(msg: string, err = false) {
    setNote(msg)
    setIsError(err)
  }

  async function pick(a: string) {
    setAvatar(a)
    const { error } = await supabase.from('members').update({ avatar: a }).eq('id', member!.id)
    if (error) say('Avatar kaydedilemedi.', true)
    else {
      patchMember({ avatar: a })
      say('Avatar kaydedildi.')
    }
  }

  async function changeCode() {
    setNote(null)
    if (!/^\d{6}$/.test(next)) {
      say(S.codeInvalid, true)
      return
    }
    const { data, error } = await supabase.rpc('change_my_code', {
      p_current: current,
      p_new: next,
    })
    if (error) {
      say('Değiştirilemedi.', true)
      return
    }
    const res = data as { ok: boolean; reason?: string }
    if (!res.ok) {
      say(
        res.reason === 'wrong_current'
          ? 'Mevcut kodun hatalı.'
          : res.reason === 'bad_format'
            ? S.codeInvalid
            : 'Değiştirilemedi.',
        true,
      )
      return
    }
    say('Kodun değişti. Bir dahaki girişte yenisini kullan.')
    setCurrent('')
    setNext('')
  }

  return (
    <main className="min-h-dvh max-w-lg mx-auto px-5 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <span aria-hidden>{avatar || '🙂'}</span> {member?.display_name}
        </h1>
        <Link to={member?.is_host ? '/host' : '/oda'} className="text-coral font-semibold text-sm">
          ← Geri
        </Link>
      </header>

      {note && (
        <p
          className={[
            'rounded-2xl px-4 py-2.5 text-sm font-semibold',
            isError ? 'bg-rose-soft text-coral-deep' : 'bg-teal-soft',
          ].join(' ')}
        >
          {note}
        </p>
      )}

      <section className="card flex flex-col gap-3">
        <h2 className="font-bold">Avatarın</h2>
        <div className="grid grid-cols-8 gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              className={[
                'aspect-square rounded-2xl border-2 text-2xl transition',
                avatar === a ? 'border-coral bg-rose-soft' : 'border-line hover:border-ink-soft',
              ].join(' ')}
              onClick={() => pick(a)}
              aria-label={a}
            >
              {a}
            </button>
          ))}
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-bold">Kodunu değiştir</h2>
        <input
          className="input-blob text-center tracking-widest"
          value={current}
          onChange={(e) => setCurrent(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Mevcut kod"
          inputMode="numeric"
        />
        <input
          className="input-blob text-center tracking-widest"
          value={next}
          onChange={(e) => setNext(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Yeni 6 haneli kod"
          inputMode="numeric"
        />
        <button
          className="btn-coral self-start"
          onClick={changeCode}
          disabled={current.length !== 6 || next.length !== 6}
        >
          Değiştir
        </button>
        <p className="text-xs font-semibold text-ink-soft">
          Gerçekte kullandığın bir PIN'i seçme.
        </p>
      </section>
    </main>
  )
}
