import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { FUNCTIONS_URL, getSupabase } from '../../lib/supabase'
import { S } from '../../lib/strings'

interface MemberRow {
  id: string
  display_name: string
  is_host: boolean
  code_set: boolean
}

/** Yolcu yönetimi — ekle, yeniden adlandır, 6 haneli kod ata. */
export default function Members() {
  const { session } = useAuth()
  const sb = getSupabase(session)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [newName, setNewName] = useState('')
  const [codeFor, setCodeFor] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [note, setNote] = useState<string | null>(null)

  async function load() {
    const { data } = await sb
      .from('members')
      .select('id, display_name, is_host, code_set')
      .order('display_name')
    setMembers((data as MemberRow[]) ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addMember() {
    const name = newName.trim()
    if (!name) return
    await sb.from('members').insert({ display_name: name })
    setNewName('')
    load()
  }

  async function saveCode(memberId: string) {
    setNote(null)
    if (!/^\d{6}$/.test(code)) {
      setNote(S.codeInvalid)
      return
    }
    const res = await fetch(`${FUNCTIONS_URL}/set-member-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.token}`,
      },
      body: JSON.stringify({ member_id: memberId, code }),
    })
    if (res.ok) {
      setNote(S.codeSaved)
      setCodeFor(null)
      setCode('')
      load()
    } else {
      setNote(S.loginError)
    }
  }

  return (
    <main className="min-h-dvh max-w-2xl mx-auto px-5 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold flex items-center gap-2">
          <span aria-hidden>🧑‍🤝‍🧑</span> {S.members}
        </h1>
        <Link to="/host" className="text-coral font-semibold text-sm">
          ← {S.hostConsole}
        </Link>
      </header>

      {note && <p className="rounded-2xl bg-teal-soft px-4 py-2.5 text-sm font-semibold">{note}</p>}

      <section className="flex flex-col gap-2">
        {members.map((m) => (
          <div key={m.id} className="card flex items-center gap-3 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">
                {m.display_name}
                {m.is_host && <span className="ml-2 text-xs text-coral font-bold">({S.isHost})</span>}
              </div>
              <div className="text-xs text-ink-soft font-semibold">
                {m.code_set ? '🔑 kod atanmış' : '⚠️ kod bekliyor'}
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
              <button className="btn-ghost text-xs px-3 py-1.5" onClick={() => setCodeFor(m.id)}>
                {S.setCode}
              </button>
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
        />
        <button className="btn-coral" onClick={addMember} disabled={!newName.trim()}>
          {S.addMember}
        </button>
      </section>
    </main>
  )
}
