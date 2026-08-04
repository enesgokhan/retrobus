import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { S } from '../../lib/strings'
import AppShell from '../../components/AppShell'

interface MemberRow {
  id: string
  display_name: string
  is_host: boolean
  code_set: boolean
}

/** Yolcu yönetimi — ekle, 6 haneli kod ata, yanlış eklediğini çıkar. */
export default function Members() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [newName, setNewName] = useState('')
  const [codeFor, setCodeFor] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [armedAt, setArmedAt] = useState(0)
  const [code, setCode] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('members')
      .select('id, display_name, is_host, code_set')
      .order('display_name')
    setMembers((data as MemberRow[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  function say(msg: string, error = false) {
    setNote(msg)
    setIsError(error)
  }

  async function addMember() {
    const name = newName.trim()
    if (!name) return
    const { error } = await supabase.from('members').insert({ display_name: name })
    if (error) {
      say(error.code === '23505' ? 'Bu isim zaten var.' : S.loginError, true)
      return
    }
    setNewName('')
    say(`${name} eklendi.`)
    load()
  }

  // A passenger added by mistake — a typo'd name, someone who cannot make it —
  // used to be permanent: there was no delete policy and no button. Their cards
  // and actions survive the removal, they simply stop being attributed.
  async function removeMember(m: MemberRow) {
    if (confirmId !== m.id) {
      setConfirmId(m.id)
      setArmedAt(Date.now())
      setNote(null)
      return
    }
    // a double-click must not answer its own question
    if (Date.now() - armedAt < 700) return
    const { error } = await supabase.from('members').delete().eq('id', m.id)
    setConfirmId(null)
    if (error) { setNote(`${m.display_name} silinemedi.`); return }
    setNote(`${m.display_name} listeden çıkarıldı.`)
    await load()
  }

  async function saveCode(memberId: string) {
    if (!/^\d{6}$/.test(code)) {
      say(S.codeInvalid, true)
      return
    }
    const { error } = await supabase.rpc('set_member_code', {
      p_member_id: memberId,
      p_code: code,
    })
    if (error) {
      say(S.loginError, true)
      return
    }
    say(S.codeSaved)
    setCodeFor(null)
    setCode('')
    load()
  }

  return (
    <AppShell title={S.members} width="reading">

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

      <section className="flex flex-col gap-2">
        {members.map((m) => (
          <div key={m.id} className="card flex items-center gap-3 py-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">
                {m.display_name}
                {m.is_host && <span className="ml-2 text-xs text-coral font-bold">({S.isHost})</span>}
              </div>
              <div className="text-xs text-ink-soft font-semibold">
                {m.code_set ? 'kod atanmış' : 'kod bekliyor'}
              </div>
            </div>
            {codeFor === m.id ? (
              <div className="flex items-center gap-2">
                <input
                  className="input-blob w-32 text-center tracking-widest"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={S.codePlaceholder}
                  inputMode="numeric"
                  autoFocus
                />
                <button className="btn-coral text-xs px-3 py-1.5" onClick={() => saveCode(m.id)}>
                  {S.save}
                </button>
                <button
                  className="text-ink-soft text-xs underline"
                  onClick={() => {
                    setCodeFor(null)
                    setCode('')
                  }}
                >
                  {S.cancel}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  className="btn-ghost text-xs px-3 py-1.5"
                  onClick={() => {
                    setCodeFor(m.id)
                    setCode('')
                    setNote(null)
                    setConfirmId(null)
                  }}
                >
                  {m.code_set ? 'Kodu değiştir' : S.setCode}
                </button>
                {!m.is_host && (
                  <button
                    className={[
                      'text-xs px-3 py-1.5 rounded-full font-bold border-2 transition',
                      confirmId === m.id
                        ? 'bg-coral text-white border-coral-deep'
                        : 'border-line text-ink-soft hover:border-coral',
                    ].join(' ')}
                    onClick={() => removeMember(m)}
                  >
                    {confirmId === m.id ? 'Emin misin? Bas' : 'Çıkar'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="card flex items-center gap-2">
        <input
          className="input-blob flex-1"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={S.memberNamePlaceholder}
          maxLength={40}
          onKeyDown={(e) => e.key === 'Enter' && addMember()}
        />
        <button className="btn-coral" onClick={addMember} disabled={!newName.trim()}>
          {S.addMember}
        </button>
      </section>
    </AppShell>
  )
}
