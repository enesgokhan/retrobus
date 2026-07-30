import { useAuth } from '../lib/auth'
import { useMeeting } from '../lib/useMeeting'
import { usePresence } from '../lib/usePresence'
import { S } from '../lib/strings'
import StageView from '../components/StageView'
import FrozenScreen from '../components/FrozenScreen'
import HostNav from '../components/HostNav'
import WelcomeNote from '../components/WelcomeNote'
import ConnStatus from '../components/ConnStatus'
import { stageTheme, themeVars } from '../lib/theme'

/** Yolcu görünümü — şoför nereye sürerse ekran oraya gider. */
export default function Room() {
  const { member } = useAuth()
  const { meeting, activeStage, loading } = useMeeting()
  // tracking presence here is what makes the host's "kim odada" bar real
  const here = usePresence(meeting?.id ?? null)

  // The whole room, header included, sits inside the active stage's world —
  // otherwise the top strip stays flat white and the nav pill stays coral while
  // everything below them changes colour, which reads as chrome bolted on.
  const theme = stageTheme(activeStage?.kind)

  return (
    <main
      className="min-h-dvh flex flex-col"
      style={{ ...themeVars(theme), background: theme.bg }}
    >
      {meeting && <WelcomeNote meetingId={meeting.id} note={meeting.welcome_note} />}
      <ConnStatus />
      <header className="accent-wash flex items-center justify-between gap-3 px-4 py-2 border-b-2 flex-wrap">
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

      <section className="flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 grid place-items-center">
            <p className="text-ink-soft">{S.loading}</p>
          </div>
        ) : meeting?.frozen ? (
          <div className="flex-1 grid place-items-center px-5">
            <FrozenScreen note={meeting.frozen_note} />
          </div>
        ) : activeStage ? (
          <StageView stage={activeStage} />
        ) : (
          <div className="flex-1 grid place-items-center px-5 text-center max-w-sm mx-auto">
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
