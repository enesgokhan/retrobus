import { Link } from 'react-router-dom'
import { useMeeting } from '../lib/useMeeting'
import { usePresence } from '../lib/usePresence'
import { S } from '../lib/strings'
import StageView from '../components/StageView'
import FrozenScreen from '../components/FrozenScreen'
import AppShell from '../components/AppShell'
import WelcomeNote from '../components/WelcomeNote'
import Empty from '../components/ui/Empty'
import { stageTheme, themeVars } from '../lib/theme'
import Icon from '../components/ui/Icon'

/** Yolcu görünümü — şoför nereye sürerse ekran oraya gider. */
export default function Room() {
  const { meeting, activeStage, loading, ended } = useMeeting()
  // tracking presence here is what makes the host's "kim odada" bar real
  const here = usePresence(meeting?.id ?? null)

  // The header sits inside the active stop's world too, so the tint reaches
  // the chrome. It no longer paints a background: the page is one colour on
  // every stop, and only the tint moves.
  const theme = stageTheme(activeStage?.kind)

  return (
    <AppShell
      width="full"
      bare
      style={themeVars(theme)}
      headerAside={
        <span
          className="text-footnote text-label-3 nums shrink-0 ml-auto sm:ml-0"
          title="odadaki kişi sayısı"
        >
          {here.size} kişi
        </span>
      }
    >
      {meeting && <WelcomeNote meetingId={meeting.id} note={meeting.welcome_note} />}

      <section className="flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 grid place-items-center">
            <p className="text-subhead text-label-2">{S.loading}</p>
          </div>
        ) : meeting?.frozen ? (
          <div className="flex-1 grid place-items-center px-5">
            <FrozenScreen note={meeting.frozen_note} />
          </div>
        ) : activeStage ? (
          <StageView stage={activeStage} />
        ) : ended ? (
          // the evening is over — say so, and hand them the keepsake
          <div className="flex-1 grid place-items-center px-5">
            <Empty
              size="lg"
              icon={<Icon name="bus" size={44} />}
              title={S.endedTitle}
              body={S.endedBody}
              action={
                <Link to="/yillik" className="btn-filled btn-lg">
                  Yıllığa bak
                </Link>
              }
            />
          </div>
        ) : (
          <div className="flex-1 grid place-items-center px-5">
            <Empty
              size="lg"
              icon={<Icon name="route" size={44} />}
              title={S.waitingTitle}
              body={S.waitingBody}
              hint={`${here.size} kişi burada bekliyor.`}
            />
          </div>
        )}
      </section>
    </AppShell>
  )
}
