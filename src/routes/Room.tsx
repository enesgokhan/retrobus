import { Link } from 'react-router-dom'
import { useMeeting } from '../lib/useMeeting'
import { usePresence } from '../lib/usePresence'
import { S } from '../lib/strings'
import StageView from '../components/StageView'
import FrozenScreen from '../components/FrozenScreen'
import AppShell from '../components/AppShell'
import WelcomeNote from '../components/WelcomeNote'
import { stageTheme, themeVars } from '../lib/theme'

/** Yolcu görünümü — şoför nereye sürerse ekran oraya gider. */
export default function Room() {
  const { meeting, activeStage, loading, ended } = useMeeting()
  // tracking presence here is what makes the host's "kim odada" bar real
  const here = usePresence(meeting?.id ?? null)

  // The whole room, header included, sits inside the active stage's world —
  // otherwise the top strip stays flat white and the nav pill stays coral while
  // everything below them changes colour, which reads as chrome bolted on.
  const theme = stageTheme(activeStage?.kind)

  return (
    <AppShell
      width="full"
      bare
      style={{ ...themeVars(theme), background: theme.bg }}
      headerAside={
        <span className="text-xs text-ink-faint tabular-nums shrink-0" title="odadaki kişi sayısı">
          {here.size} kişi
        </span>
      }
    >
      {meeting && <WelcomeNote meetingId={meeting.id} note={meeting.welcome_note} />}

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
        ) : ended ? (
          // the evening is over — say so, and hand them the keepsake
          <div className="flex-1 grid place-items-center px-5 text-center max-w-md mx-auto">
            <div>
              <div className="text-8xl mb-4" aria-hidden>
                🚌
              </div>
              <h2 className="text-3xl font-extrabold mb-2">{S.endedTitle}</h2>
              <p className="text-ink-soft mb-5">{S.endedBody}</p>
              <Link to="/yillik" className="btn-coral">
                📖 Yıllığa bak
              </Link>
            </div>
          </div>
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
    </AppShell>
  )
}
