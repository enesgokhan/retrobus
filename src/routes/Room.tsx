import { useAuth } from '../lib/auth'
import { useMeeting } from '../lib/useMeeting'
import { usePresence } from '../lib/usePresence'
import { S } from '../lib/strings'
import StageView from '../components/StageView'
import FrozenScreen from '../components/FrozenScreen'
import HostNav from '../components/HostNav'

/** Yolcu görünümü — şoför nereye sürerse ekran oraya gider. */
export default function Room() {
  const { member } = useAuth()
  const { meeting, activeStage, loading } = useMeeting()
  // tracking presence here is what makes the host's "kim odada" bar real
  const here = usePresence(meeting?.id ?? null)

  return (
    <main className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-2 border-b-2 border-line bg-card flex-wrap">
        <div className="flex items-center gap-2 font-extrabold shrink-0">
          <span aria-hidden>🚌</span>
          <span className="hidden sm:inline">{S.appName}</span>
          <span className="text-sm font-semibold text-ink-soft flex items-center gap-1">
            <span aria-hidden>{member?.avatar || '🙂'}</span>
            {member?.display_name}
          </span>
          <span className="text-xs text-ink-soft" title="odadaki kişi sayısı">
            🟢 {here.size}
          </span>
        </div>
        <HostNav />
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
