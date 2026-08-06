import { useState } from 'react'
import { supabase } from '../lib/supabase'
import AppShell from '../components/AppShell'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
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
    <AppShell title={member?.display_name ?? 'Profil'} width="narrow">

      <div className="flex flex-col gap-6">
        {note && <Alert tone={isError ? 'bad' : 'info'}>{note}</Alert>}

        <section className="flex flex-col gap-3">
          <h2 className="text-overline uppercase text-label-3 px-1">Avatarın</h2>
          <div className="grid grid-cols-8 gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                className={[
                  'aspect-square rounded-sm text-2xl grid place-items-center min-h-11',
                  'transition-[background-color,box-shadow,transform] duration-150',
                  avatar === a
                    ? 'bg-[color-mix(in_srgb,var(--tint)_22%,transparent)] shadow-[inset_0_0_0_1px_var(--tint)] scale-105'
                    : 'bg-fill-3 hover:bg-fill-2',
                ].join(' ')}
                onClick={() => pick(a)}
                aria-label={a}
              >
                {a}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-overline uppercase text-label-3 px-1">Kodunu değiştir</h2>
          <input
            className="field text-center tracking-widest nums"
            value={current}
            onChange={(e) => setCurrent(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Mevcut kod"
            aria-label="Mevcut kod"
            inputMode="numeric"
          />
          <input
            className="field text-center tracking-widest nums"
            value={next}
            onChange={(e) => setNext(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Yeni 6 haneli kod"
            aria-label="Yeni 6 haneli kod"
            inputMode="numeric"
          />
          <Button
            variant="filled"
            onClick={changeCode}
            disabled={current.length !== 6 || next.length !== 6}
          >
            Değiştir
          </Button>
          <p className="text-footnote text-label-3">Gerçekte kullandığın bir PIN'i seçme.</p>
        </section>
      </div>
    </AppShell>
  )
}
