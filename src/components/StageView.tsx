import type { ReactNode } from 'react'
import type { Stage } from '../lib/types'
import { S } from '../lib/strings'
import { stageTheme, themeVars } from '../lib/theme'
import TimerStrip from './TimerStrip'
import BoardStage from '../stages/BoardStage'
import PollStage from '../stages/PollStage'
import WordCloudStage from '../stages/WordCloudStage'
import HealthCheckStage from '../stages/HealthCheckStage'
import TwoTruthsStage from '../stages/TwoTruthsStage'
import FeedbackWallStage from '../stages/FeedbackWallStage'
import QuizStage from '../stages/QuizStage'
import LeaderboardStage from '../stages/LeaderboardStage'
import FibbageStage from '../stages/FibbageStage'
import RankStage from '../stages/RankStage'
import CodenamesStage from '../stages/CodenamesStage'
import WavelengthStage from '../stages/WavelengthStage'
import MissionStage from '../stages/MissionStage'
import BreakStage from '../stages/BreakStage'

const KIND_EMOJI: Record<string, string> = {
  wordcloud: '☁️',
  two_truths: '🤥',
  health_check: '🩺',
  lean_coffee: '☕',
  board: '📌',
  poll: '📊',
  feedback_wall: '💌',
  suggestions: '💡',
  quiz: '🏆',
  codenames: '🕵️',
  wavelength: '📻',
  leaderboard: '🥇',
  break: '🧃',
  fibbage: '🤫',
  rank: '🔢',
  secret_mission: '🕶️',
}

/**
 * Card-and-dot-vote kinds all share BoardStage. AMA rides on it too: anonymous
 * questions plus dot voting is exactly what surfaces the ones worth answering.
 */
const BOARD_KINDS = new Set(['board', 'lean_coffee', 'suggestions'])

/**
 * Renders the active stage inside its own colour world (see lib/theme.ts).
 *
 * The theme is applied as CSS custom properties on the wrapper, so the shared
 * utilities (`card`, `btn-coral`, `input-blob`) pick up the stage accent without
 * any stage component needing to know theming exists.
 */
export default function StageView({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const emoji = KIND_EMOJI[stage.kind] ?? '🚏'
  const kindLabel = S.kind[stage.kind] ?? stage.kind
  const theme = stageTheme(stage.kind)

  let body: ReactNode = (
    <div className="card w-full max-w-2xl text-center text-ink-soft">
      {stage.state === 'open' ? S.stageOpen : stage.state === 'revealed' ? S.stageRevealed : S.stageClosed}
    </div>
  )
  if (BOARD_KINDS.has(stage.kind)) {
    body = <BoardStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'poll') {
    body = <PollStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'wordcloud') {
    body = <WordCloudStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'health_check') {
    body = <HealthCheckStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'two_truths') {
    body = <TwoTruthsStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'feedback_wall') {
    body = <FeedbackWallStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'quiz') {
    body = <QuizStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'leaderboard') {
    body = <LeaderboardStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'fibbage') {
    body = <FibbageStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'rank') {
    body = <RankStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'codenames') {
    body = <CodenamesStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'wavelength') {
    body = <WavelengthStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'secret_mission') {
    body = <MissionStage stage={stage} presenter={presenter} />
  } else if (stage.kind === 'break') {
    body = <BreakStage stage={stage} presenter={presenter} />
  }

  // the break screen owns its whole surface — no title furniture above it
  const bare = stage.kind === 'break'

  return (
    <div
      className={[
        'stage-world flex-1 flex flex-col items-center gap-5 w-full px-3 py-7 sm:px-6',
        // a shared screen should sit in the middle of the display, not hug the top
        presenter ? 'justify-center' : '',
      ].join(' ')}
      style={themeVars(theme)}
      data-stage-kind={stage.kind}
      data-stage-mood={theme.mood}
    >
      {!bare && (
        <>
          {stage.config.prompt && (
            <div className="accent-wash w-full max-w-4xl rounded-2xl border-2 px-5 py-3 text-center font-semibold">
              {stage.config.prompt}
            </div>
          )}
          <TimerStrip stage={stage} big={presenter} />
          <div className={presenter ? 'text-8xl' : 'text-6xl'} aria-hidden>
            {emoji}
          </div>
          <div className="text-center">
            {/* several presets name the stage after its kind, so printing both
                just repeats the same words twice */}
            {kindLabel.toLocaleLowerCase('tr') !== stage.title.trim().toLocaleLowerCase('tr') && (
              <div className="text-sm font-bold uppercase tracking-widest text-ink-soft">{kindLabel}</div>
            )}
            <h2 className={presenter ? 'text-5xl font-extrabold' : 'stage-title font-extrabold'}>
              {stage.title}
            </h2>
          </div>
        </>
      )}
      {body}
    </div>
  )
}
