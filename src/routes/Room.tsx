import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useMeeting } from '../lib/useMeeting'
import { usePresence } from '../lib/usePresence'
import { S } from '../lib/strings'
import StageView from '../components/StageView'
import FrozenScreen from '../components/FrozenScreen'

/** Yolcu görünümü — şoför nereye sürerse ekran oraya gider. */
export default function Room() {
  const { member, logout } = useAuth()
  const { meeting, activeStage, loading } = useMeeting()
  // tracking presence here is what makes the host's "kim odada" bar real
  const here = usePresence(meeting?.id ?? null)

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between px-5 py-3 border-b-2 border-line bg-card">
        <div className="flex items-center gap-2 font-extrabold">
          <span aria-hidden>🚌</span> {S.appName}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link to="/profil" className="font-semibold text-ink-soft hover:text-ink flex items-center gap-1.5">
            <span aria-hidden>{member?.avatar || '🙂'}</span>
            {member?.display_name}
          </Link>
          {member?.is_host && (
            <Link className="font-bold text-coral" to="/host">
              {S.hostConsole}
            </Link>
          )}
          <Link to="/kurallar" className="text-ink-soft" title="oyun kuralları">
            📖
          </Link>
          <span className="text-ink-soft hidden sm:inline" title="odadaki kişi sayısı">
            🟢 {here.size}
          </span>
          <button className="text-ink-soft underline" onClick={logout}>
            {S.logout}
          </button>
        </div>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center px-5 py-8">
        {loading ? (
          <p className="text-ink-soft">{S.loading}</p>
        ) : meeting?.frozen ? (
          <FrozenScreen note={meeting.frozen_note} />
        ) : activeStage ? (
          <StageView stage={activeStage} />
        ) : (
          <div className="text-center max-w-sm">
            <div className="text-7xl mb-4" aria-hidden>
              🚏
            </div>
            <h2 className="text-2xl font-extrabold mb-1">{S.waitingTitle}</h2>
            <p className="text-ink-soft">{S.waitingBody}</p>
          </div>
        )}
      </section>
    </main>
  )
}
