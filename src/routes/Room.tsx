import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useMeeting } from '../lib/useMeeting'
import { S } from '../lib/strings'
import StageView from '../components/StageView'

/** Yolcu görünümü — şoför nereye sürerse ekran oraya gider. */
export default function Room() {
  const { session, logout } = useAuth()
  const { meeting, activeStage, loading } = useMeeting()

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between px-5 py-3 border-b-2 border-line bg-card">
        <div className="flex items-center gap-2 font-extrabold">
          <span aria-hidden>🚌</span> {S.appName}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-ink-soft">{session?.member.display_name}</span>
          {session?.member.is_host && (
            <Link className="font-bold text-coral" to="/host">
              {S.hostConsole}
            </Link>
          )}
          <button className="text-ink-soft underline" onClick={logout}>
            {S.logout}
          </button>
        </div>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center px-5 py-8">
        {loading ? (
          <p className="text-ink-soft">{S.loading}</p>
        ) : activeStage ? (
          <StageView stage={activeStage} />
        ) : (
          <div className="text-center max-w-sm">
            <div className="text-7xl mb-4" aria-hidden>
              🚏
            </div>
            <h2 className="text-2xl font-extrabold mb-1">{S.waitingTitle}</h2>
            <p className="text-ink-soft">{meeting ? S.waitingBody : S.waitingBody}</p>
          </div>
        )}
      </section>
    </main>
  )
}
