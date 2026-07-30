import type { Stage } from '../lib/types'
import { S } from '../lib/strings'
import TimerStrip from './TimerStrip'

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
}

/**
 * Renders the active stage. Stage-kind bodies are filled in phase by phase;
 * until a kind has its component, passengers see a friendly placeholder.
 */
export default function StageView({ stage, presenter = false }: { stage: Stage; presenter?: boolean }) {
  const emoji = KIND_EMOJI[stage.kind] ?? '🚏'
  const kindLabel = S.kind[stage.kind] ?? stage.kind

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {stage.config.prompt && (
        <div className="w-full max-w-2xl rounded-2xl bg-amber-soft border-2 border-amber/40 px-5 py-3 text-center font-semibold">
          {stage.config.prompt}
        </div>
      )}
      <div className="flex items-center gap-3">
        <TimerStrip stage={stage} big={presenter} />
      </div>
      <div className={presenter ? 'text-8xl' : 'text-6xl'} aria-hidden>
        {emoji}
      </div>
      <div className="text-center">
        <div className="text-sm font-bold uppercase tracking-widest text-ink-soft">{kindLabel}</div>
        <h2 className={presenter ? 'text-5xl font-extrabold' : 'text-2xl font-extrabold'}>{stage.title}</h2>
      </div>
      {/* Stage bodies land here per kind as they are built (phase 2+). */}
      <div className="card w-full max-w-2xl text-center text-ink-soft">
        {stage.state === 'open' ? S.stageOpen : stage.state === 'revealed' ? S.stageRevealed : S.stageClosed}
      </div>
    </div>
  )
}
