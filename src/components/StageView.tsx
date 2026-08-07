import type { ReactNode } from 'react'
import type { Stage } from '../lib/types'
import { S } from '../lib/strings'
import { stageTheme, themeVars } from '../lib/theme'
import TimerStrip from './TimerStrip'
import Icon from './ui/Icon'
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


/**
 * Card-and-dot-vote kinds all share BoardStage. AMA rides on it too: anonymous
 * questions plus dot voting is exactly what surfaces the ones worth answering.
 */
const BOARD_KINDS = new Set(['board', 'lean_coffee', 'suggestions'])

/**
 * Stops whose body wants the full width of the screen rather than a reading
 * column: boards of many cards, a 5×5 grid, a spectrum.
 *
 * `health_check` and `leaderboard` are deliberately NOT here. Both are narrow
 * by nature — six labelled rows of three buttons, and a scoreboard — and at
 * 1400px they became a left-hand strip with half the screen empty beside it,
 * which reads as broken rather than as spacious.
 */
const WIDE_KINDS = new Set([
  'board',
  'lean_coffee',
  'suggestions',
  'codenames',
  'wavelength',
  'wordcloud',
  'feedback_wall',
])

/**
 * The active stop, in its own colour world.
 *
 * Two archetypes, and every stop is one of them:
 *
 *   WORKSPACE  you are doing something. The title block is left-aligned at the
 *              top of a column, the way a document is, and the body starts
 *              immediately under it. Reading and typing want a left edge.
 *   MOMENT     you are looking at something together — a scoreboard, a break.
 *              Centred, vertically centred, and the title is a size larger.
 *
 * Both were previously the same layout: everything centred, the title in a
 * class whose size came from a per-world `scale` multiplier that ran to 1.9×,
 * and the prompt in a 2px-bordered box ABOVE the title — so the instruction
 * arrived before the thing it was instructing about.
 *
 * Order here is identity, then instruction, then work.
 */
export default function StageView({
  stage,
  presenter = false,
}: {
  stage: Stage
  presenter?: boolean
}) {
  const kindLabel = S.kind[stage.kind] ?? stage.kind
  const theme = stageTheme(stage.kind)

  let body: ReactNode = (
    <div className="card w-full max-w-xl text-center text-label-2 text-callout">
      {stage.state === 'open'
        ? S.stageOpen
        : stage.state === 'revealed'
          ? S.stageRevealed
          : S.stageClosed}
    </div>
  )
  if (BOARD_KINDS.has(stage.kind)) body = <BoardStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'poll') body = <PollStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'wordcloud') body = <WordCloudStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'health_check') body = <HealthCheckStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'two_truths') body = <TwoTruthsStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'feedback_wall') body = <FeedbackWallStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'quiz') body = <QuizStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'leaderboard') body = <LeaderboardStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'fibbage') body = <FibbageStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'rank') body = <RankStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'codenames') body = <CodenamesStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'wavelength') body = <WavelengthStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'secret_mission') body = <MissionStage stage={stage} presenter={presenter} />
  else if (stage.kind === 'break') body = <BreakStage stage={stage} presenter={presenter} />

  // the break screen owns its whole surface — no title furniture above it
  const bare = stage.kind === 'break'
  const moment = presenter || theme.weight === 'moment'
  const wide = WIDE_KINDS.has(stage.kind)

  // several presets name the stop after its kind, so printing both just says
  // the same words twice — including the "Fibbage — İnandırıcı Yalan" over
  // "İnandırıcı Yalan" case, where one contains the other
  const k = kindLabel.toLocaleLowerCase('tr')
  const t = stage.title.trim().toLocaleLowerCase('tr')
  const showKind = !k.includes(t) && !t.includes(k)

  return (
    <div
      className="stage-world relative flex-1 flex flex-col w-full"
      style={themeVars(theme)}
      data-stage-kind={stage.kind}
      data-stage-mood={theme.mood}
      data-stage-layout={moment ? 'moment' : 'workspace'}
    >
      <div className="stage-wash" aria-hidden />

      <div
        className={[
          'relative flex-1 flex flex-col w-full mx-auto px-5 sm:px-8',
          wide ? 'max-w-[1400px]' : 'max-w-4xl',
          moment ? 'justify-center py-10' : 'pt-8 pb-16',
        ].join(' ')}
      >
        {!bare && (
          <header
            className={[
              'shrink-0 animate-rise',
              moment ? 'text-center mb-8' : 'mb-7',
              presenter ? 'mb-10' : '',
            ].join(' ')}
          >
            {showKind && (
              <div
                className={[
                  'flex items-center gap-2 text-overline uppercase text-label-3',
                  moment ? 'justify-center' : '',
                ].join(' ')}
              >
                <Icon name={stage.kind} size={14} className="opacity-85" />
                {kindLabel}
              </div>
            )}
            <h2
              className={[
                'stage-title mt-1.5 text-balance',
                presenter ? 'text-display' : moment ? 'text-title-1' : 'text-title-2',
              ].join(' ')}
            >
              {stage.title}
            </h2>

            {/* The instruction, as a lead paragraph. It used to be a 2px
                bordered tinted box sitting above the title, which made the
                loudest object on the screen the one sentence nobody needed to
                re-read after the first ten seconds. */}
            {stage.config.prompt && (
              <p
                className={[
                  'mt-3 text-label-2 text-balance leading-relaxed',
                  presenter ? 'text-title-3' : moment ? 'text-callout' : 'text-body',
                  moment ? 'mx-auto max-w-2xl' : 'max-w-2xl',
                ].join(' ')}
              >
                {stage.config.prompt}
              </p>
            )}

            <div className={['mt-4 flex', moment ? 'justify-center' : ''].join(' ')}>
              <TimerStrip stage={stage} big={presenter} />
            </div>
          </header>
        )}

        {/* Keyed by stage: two consecutive stops of the same kind (three boards
            in a row, two feedback walls) otherwise reconcile as one component
            and carry the previous stop's drafts and selections across. */}
        {/* `flex-1` here and on each stage's own root is what lets a short body
            centre itself in the leftover height: `Empty` carries `m-auto`, and
            auto margins only absorb free space if an ancestor chain of column
            flex boxes actually HAS free space to give. Without it a waiting
            screen sat pinned under the title with 60% of the page below it
            empty — which is most of what "the screens feel empty" meant. */}
        <div
          key={stage.id}
          className={[
            'w-full flex-1 flex flex-col min-w-0',
            moment || bare ? 'items-center' : '',
          ].join(' ')}
        >
          {body}
        </div>
      </div>
    </div>
  )
}
