import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { S } from '../../lib/strings'
import AppShell from '../../components/AppShell'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'

interface MemberRow {
  id: string
  display_name: string
  is_host: boolean
  code_set: boolean
  avatar: string | null
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
      .select('id, display_name, is_host, code_set, avatar')
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

      {note && <Alert tone={isError ? 'bad' : 'info'}>{note}</Alert>}

      {/* A roster is a list, not five stacked panels. The host role was a red
          parenthetical at footnote size beside the name — the one piece of
          status on the row, styled as an aside. */}
      <div className="list-group">
        {members.map((m) => (
          <div key={m.id} className="list-row list-row-inset flex-wrap gap-y-2">
            <span className="shrink-0 size-8 grid place-items-center text-xl" aria-hidden>
              {m.avatar || '🙂'}
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-headline truncate">{m.display_name}</span>
                {m.is_host && <span className="badge-tinted shrink-0">{S.isHost}</span>}
              </span>
              <span className="block text-footnote text-label-3 mt-0.5">
                {m.code_set ? 'kod atanmış' : 'kod bekliyor'}
              </span>
            </span>

            {codeFor === m.id ? (
              <span className="flex items-center gap-2">
                <input
                  className="field w-32 text-center tracking-widest nums"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={S.codePlaceholder}
                  inputMode="numeric"
                  aria-label={`${m.display_name} için kod`}
                  autoFocus
                />
                <Button variant="filled" size="sm" onClick={() => saveCode(m.id)}>
                  {S.save}
                </Button>
                <Button
                  variant="plain"
                  size="sm"
                  onClick={() => {
                    setCodeFor(null)
                    setCode('')
                  }}
                >
                  {S.cancel}
                </Button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setCodeFor(m.id)
                    setCode('')
                    setNote(null)
                    setConfirmId(null)
                  }}
                >
                  {m.code_set ? 'Kodu değiştir' : S.setCode}
                </Button>
                {!m.is_host && (
                  <Button variant="danger" size="sm" onClick={() => removeMember(m)}>
                    {confirmId === m.id ? 'Emin misin? Bas' : 'Çıkar'}
                  </Button>
                )}
              </span>
            )}
          </div>
        ))}
      </div>

      <section className="flex items-center gap-2 mt-4">
        <input
          className="field flex-1"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={S.memberNamePlaceholder}
          aria-label={S.addMember}
          maxLength={40}
          onKeyDown={(e) => e.key === 'Enter' && addMember()}
        />
        <Button variant="filled" onClick={addMember} disabled={!newName.trim()}>
          {S.addMember}
        </Button>
      </section>
    </AppShell>
  )
}
