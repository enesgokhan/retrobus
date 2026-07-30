import { useMeeting } from '../lib/useMeeting'
import { S } from '../lib/strings'
import StageView from '../components/StageView'
import FrozenScreen from '../components/FrozenScreen'

/** Sunum modu — ekran paylaşımı için büyük, kontrolsüz görünüm. */
export default function Sunum() {
  const { meeting, activeStage, loading } = useMeeting()

  return (
    <main className="min-h-dvh flex flex-col">
      {loading ? (
        <div className="flex-1 grid place-items-center">
          <p className="text-ink-soft text-2xl">{S.loading}</p>
        </div>
      ) : meeting?.frozen ? (
        <div className="flex-1 grid place-items-center px-10">
          <FrozenScreen note={meeting.frozen_note} big />
        </div>
      ) : activeStage ? (
        <StageView stage={activeStage} presenter />
      ) : (
        <div className="flex-1 grid place-items-center text-center px-10">
          <div>
            <div className="text-9xl mb-6" aria-hidden>
              🚌
            </div>
            <h1 className="text-6xl font-extrabold">{S.appName}</h1>
            <p className="text-2xl text-ink-soft mt-3">{S.waitingTitle}</p>
          </div>
        </div>
      )}
    </main>
  )
}
