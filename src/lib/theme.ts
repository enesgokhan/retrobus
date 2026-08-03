import type { StageKind } from './types'

export interface StageTheme {
  /** short human label for the mood, shown nowhere — documentation for us */
  mood: string
  /** page background */
  bg: string
  /** card surface */
  surface: string
  /** the one accent colour this stage world uses */
  accent: string
  /** darker accent, for the pressed edge on buttons */
  accentDeep: string
  /** text on top of the accent */
  accentInk: string
  /** tinted wash for headers and highlights */
  wash: string
  /** hairline / border */
  line: string
  /** heading scale multiplier applied to stage titles */
  scale: number
}

const T = {
  /** Tartışma: sakin, kağıt gibi. Konuşmak için, oynamak için değil. */
  discussion: {
    mood: 'calm / papery',
    bg: '#0b0c0f',
    surface: '#141519',
    accent: '#3fb6a8',
    accentDeep: '#2f9488',
    accentInk: '#04110e',
    wash: '#12211f',
    line: '#24262c',
    scale: 1,
  },
  /** Buz kırıcı: sıcak, samimi, düşük risk. */
  icebreaker: {
    mood: 'warm / friendly',
    bg: '#0c0b09',
    surface: '#161512',
    accent: '#e0a343',
    accentDeep: '#bd8730',
    accentInk: '#140f04',
    wash: '#221c11',
    line: '#2a2721',
    scale: 1.1,
  },
  /** Oyun: canlı, yüksek kontrast, büyük tip. Vites değişimi burada hissedilir. */
  game: {
    mood: 'vivid / high-contrast',
    bg: '#0b0b10',
    surface: '#15151c',
    accent: '#8b7cf6',
    accentDeep: '#6e5de0',
    accentInk: '#0a0714',
    wash: '#1c1a2b',
    line: '#272632',
    scale: 1.35,
  },
  /** Geri bildirim: bilinçli olarak sakin. Burası parti değil. */
  feedback: {
    mood: 'soft / deliberately not party',
    bg: '#0f0b0c',
    surface: '#181315',
    accent: '#e8738f',
    accentDeep: '#c85875',
    accentInk: '#160609',
    wash: '#251519',
    line: '#2d2427',
    scale: 1,
  },
  /** Final: kutlama. En büyük tip, altın. */
  finale: {
    mood: 'gold / celebration',
    bg: '#0d0b06',
    surface: '#171410',
    accent: '#f0c24b',
    accentDeep: '#cba233',
    accentInk: '#140f02',
    wash: '#241d0e',
    line: '#2c2720',
    scale: 1.9,
  },
  /** Mola: sessiz, neredeyse boş. */
  pause: {
    mood: 'quiet',
    bg: '#0a0b0d',
    surface: '#131518',
    accent: '#7c8595',
    accentDeep: '#636c7b',
    accentInk: '#080a0c',
    wash: '#191c21',
    line: '#232629',
    scale: 1,
  },
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

/**
 * Her durak türünün kendi renk dünyası.
 *
 * Neden: uygulamanın hedefi "bir araç değil, bir etkinlik" gibi hissettirmek.
 * Tartışmadan oyuna geçtiğinde odanın vites değiştirdiğini GÖRMEK gerekiyor —
 * hepsi aynı krem/beyaz kartlarsa üç saat tek bir düzlük gibi geçiyor.
 *
 * Tek mekanizma: burada dönen tokenlar CSS custom property olarak StageView'in
 * sardığı bir div'e basılır ve `card` / `btn-coral` / `input-blob` gibi mevcut
 * yardımcılar bunları okur. Hiçbir bileşenin yeniden yazılması gerekmiyor.
 */
export function stageTheme(kind: StageKind | undefined): StageTheme {
  // undefined = no stage yet (the room before the host starts); the calm
  // papery world is the right default to wait in
  return (kind && BY_KIND[kind]) || T.discussion
}

/** The custom properties to spread onto a wrapper element's style. */
export function themeVars(theme: StageTheme): React.CSSProperties {
  return {
    // consumed by the @utility rules in index.css
    ['--stage-bg' as string]: theme.bg,
    ['--stage-surface' as string]: theme.surface,
    ['--stage-accent' as string]: theme.accent,
    ['--stage-accent-deep' as string]: theme.accentDeep,
    ['--stage-accent-ink' as string]: theme.accentInk,
    ['--stage-wash' as string]: theme.wash,
    ['--stage-line' as string]: theme.line,
    ['--stage-scale' as string]: String(theme.scale),
  } as React.CSSProperties
}
