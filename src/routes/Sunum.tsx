import { useMeeting } from '../lib/useMeeting'
import { S } from '../lib/strings'
import StageView from '../components/StageView'
import FrozenScreen from '../components/FrozenScreen'

/** Sunum modu — ekran paylaşımı için büyük, kontrolsüz görünüm. */
export default function Sunum() {
  const { meeting, activeStage, loading } = useMeeting()

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-10 py-12">
      {loading ? (
        <p className="text-ink-soft text-2xl">{S.loading}</p>
      ) : meeting?.frozen ? (
        <FrozenScreen note={meeting.frozen_note} big />
      ) : activeStage ? (
        <StageView stage={activeStage} presenter />
      ) : (
        <div className="text-center">
          <div className="text-9xl mb-6" aria-hidden>
            🚌
          </div>
          <h1 className="text-6xl font-extrabold">{S.appName}</h1>
          <p className="text-2xl text-ink-soft mt-3">{S.waitingTitle}</p>
        </div>
      )}
    </main>
  )
}
