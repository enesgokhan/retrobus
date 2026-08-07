import type { StageKind } from './types'

/**
 * A stop's colour world.
 *
 * The previous version of this file moved the page background, the card
 * surface AND the hairline colour for each of six worlds — #0b0c0f for a
 * discussion, #0d0b06 for the finale, #0f0b0c for feedback. Individually
 * imperceptible; together they meant no two screens in the app shared a
 * surface, and the ground shifted under the reader at every stop. It also made
 * every component that wanted a border pick between two sources of truth.
 *
 * A stop now changes exactly one thing: THE TINT. The page, the surfaces and
 * the separators are identical across all sixteen kinds. Moving from a
 * discussion into a game reads as the room changing colour — which is the
 * effect that was wanted — rather than as the app reloading as a different
 * product.
 *
 * The other thing that left: `scale`, a per-world multiplier that grew stage
 * titles up to 1.9×. That was a type ramp implemented as a number. Emphasis is
 * now chosen from the ramp by the screen that needs it (`text-title-1` for a
 * moment, `text-title-2` for a working stop), which means the same intent
 * produces the same size everywhere.
 */
export interface StageTheme {
  /** short human label for the mood — documentation, rendered nowhere */
  mood: string
  /**
   * The one colour this world is allowed — as a TOKEN REFERENCE, never a hex.
   *
   * These used to be literal hexes copied from the dark theme, written onto
   * `--tint` as an inline style, which beats every stylesheet rule. So the
   * light theme's re-picked tints were unreachable inside a stop, and the
   * finale ran #ffd60a as text on white: 1.41:1.
   */
  tint: string
  /** text placed ON the tint; dark, because every tint is vivid */
  tintInk: string
  /**
   * Whether this stop is a MOMENT (looked at together) or a WORKSPACE (worked
   * in individually). It decides vertical centring and title size — the two
   * things that were previously decided per-stage by hand and disagreed.
   */
  weight: 'moment' | 'work'
}

const T = {
  /** Tartışma: sakin, nötr. Konuşmak için, oynamak için değil. */
  discussion: { mood: 'calm', tint: 'var(--color-blue)', tintInk: 'var(--ink-on-blue)', weight: 'work' },
  /** Buz kırıcı: sıcak, samimi, düşük risk. */
  icebreaker: { mood: 'warm', tint: 'var(--color-orange)', tintInk: 'var(--ink-on-orange)', weight: 'work' },
  /** Oyun: canlı. Vites değişimi burada hissedilir. */
  game: { mood: 'vivid', tint: 'var(--color-purple)', tintInk: 'var(--ink-on-purple)', weight: 'work' },
  /** Geri bildirim: bilinçli olarak yumuşak. Burası parti değil. */
  feedback: { mood: 'soft', tint: 'var(--color-pink)', tintInk: 'var(--ink-on-pink)', weight: 'work' },
  /** Final: kutlama. Altın, ve bakılacak bir an. */
  finale: { mood: 'gold', tint: 'var(--color-yellow)', tintInk: 'var(--ink-on-yellow)', weight: 'moment' },
  /** Mola: sessiz, neredeyse boş. */
  pause: { mood: 'quiet', tint: 'var(--color-gray)', tintInk: 'var(--ink-on-gray)', weight: 'moment' },
} satisfies Record<string, StageTheme>

const BY_KIND: Record<StageKind, StageTheme> = {
  board: T.discussion,
  lean_coffee: T.discussion,
  suggestions: T.discussion,
  poll: T.discussion,

  wordcloud: T.icebreaker,
  two_truths: T.icebreaker,
  health_check: T.icebreaker,

  quiz: T.game,
  fibbage: T.game,
  rank: T.game,
  codenames: T.game,
  wavelength: T.game,

  feedback_wall: T.feedback,

  leaderboard: T.finale,
  secret_mission: T.finale,

  break: T.pause,
}

/** The world a stop lives in; the calm one is the right place to wait. */
export function stageTheme(kind: StageKind | undefined): StageTheme {
  return (kind && BY_KIND[kind]) || T.discussion
}

/**
 * The custom properties to spread onto the wrapper element.
 *
 * `--tint` / `--tint-ink` are what the design system reads: every button,
 * chip, field and focus ring resolves its colour from them, so a stage
 * component never names a colour and cannot drift.
 *
 * The `--stage-*` names below are the old vocabulary, still emitted while the
 * stage components migrate off them. They are aliases now, not a second source
 * of truth — `--stage-accent` IS `--tint`.
 */
export function themeVars(theme: StageTheme): React.CSSProperties {
  return {
    ['--tint' as string]: theme.tint,
    ['--tint-ink' as string]: theme.tintInk,

    // compatibility, pending migration of the stage components
    ['--stage-tint' as string]: theme.tint,
    ['--stage-tint-ink' as string]: theme.tintInk,
    ['--stage-accent' as string]: theme.tint,
    ['--stage-accent-deep' as string]: theme.tint,
    ['--stage-accent-ink' as string]: theme.tintInk,
    ['--stage-wash' as string]: `color-mix(in srgb, ${theme.tint} 12%, transparent)`,
    ['--stage-line' as string]: 'var(--color-sep)',
    ['--stage-surface' as string]: 'var(--color-bg-1)',
  } as React.CSSProperties
}
