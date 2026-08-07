import { useMeeting } from '../lib/useMeeting'
import { S } from '../lib/strings'
import StageView from '../components/StageView'
import FrozenScreen from '../components/FrozenScreen'
import ConnStatus from '../components/ConnStatus'
import Icon from '../components/ui/Icon'

/** Sunum modu — ekran paylaşımı için büyük, kontrolsüz görünüm. */
export default function Sunum() {
  const { meeting, activeStage, loading } = useMeeting()

  return (
    <main className="min-h-dvh flex flex-col">
      <ConnStatus />
      {loading ? (
        <div className="flex-1 grid place-items-center">
          <p className="text-title-2 text-label-2">{S.loading}</p>
        </div>
      ) : meeting?.frozen ? (
        <div className="flex-1 grid place-items-center px-10">
          <FrozenScreen note={meeting.frozen_note} big />
        </div>
      ) : activeStage ? (
        <StageView stage={activeStage} presenter />
      ) : (
        /* The holding screen, shown on a shared call before anything starts.
           It is the room's wallpaper for however long it takes everyone to
           arrive, so it carries the code they need rather than only a bus. */
        <div className="flex-1 grid place-items-center text-center px-10 relative">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(60% 50% at 50% 30%, color-mix(in srgb, var(--color-brand) 12%, transparent), transparent 70%)',
            }}
            aria-hidden
          />
          <div className="relative">
            <div className="mb-6 grid place-items-center text-label-2">
              <Icon name="bus" size={96} strokeWidth={1.1} />
            </div>
            <h1 className="text-display">{S.appName}</h1>
            <p className="text-title-2 text-label-2 mt-4">{S.waitingTitle}</p>
            {meeting?.join_code && meeting.join_open && (
              <p className="mt-10 text-label-3 text-title-3">
                Katılmak için:{' '}
                <span className="text-display nums tracking-[0.18em] text-label align-middle ml-2">
                  {meeting.join_code}
                </span>
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
