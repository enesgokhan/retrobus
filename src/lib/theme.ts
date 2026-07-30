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
    bg: '#FBF9F5',
    surface: '#FFFFFF',
    accent: '#0F9D8F',
    accentDeep: '#0B7A6F',
    accentInk: '#FFFFFF',
    wash: '#E4F5F2',
    line: '#E4DED2',
    scale: 1,
  },
  /** Buz kırıcı: sıcak, samimi, düşük risk. */
  icebreaker: {
    mood: 'warm / friendly',
    bg: '#FFFAF0',
    surface: '#FFFFFF',
    accent: '#E8890C',
    accentDeep: '#C06F00',
    accentInk: '#FFFFFF',
    wash: '#FFF0D4',
    line: '#F0E3CB',
    scale: 1.05,
  },
  /** Oyun: canlı, yüksek kontrast, büyük tip. Vites değişimi burada hissedilir. */
  game: {
    mood: 'vivid / high-contrast',
    bg: '#F4F1FF',
    surface: '#FFFFFF',
    accent: '#7C3AED',
    accentDeep: '#5B21B6',
    accentInk: '#FFFFFF',
    wash: '#EBE3FF',
    line: '#DDD2F5',
    scale: 1.15,
  },
  /** Geri bildirim: bilinçli olarak sakin. Burası parti değil. */
  feedback: {
    mood: 'soft / deliberately not party',
    bg: '#FDF7F7',
    surface: '#FFFFFF',
    accent: '#D14D5E',
    accentDeep: '#AE3444',
    accentInk: '#FFFFFF',
    wash: '#FBE7E9',
    line: '#F0DCDE',
    scale: 1,
  },
  /** Final: kutlama. En büyük tip, altın. */
  finale: {
    mood: 'gold / celebration',
    bg: '#FFFBEB',
    surface: '#FFFFFF',
    accent: '#C2820B',
    accentDeep: '#996507',
    accentInk: '#FFFFFF',
    wash: '#FFF3C4',
    line: '#F0E0AE',
    scale: 1.3,
  },
  /** Mola: sessiz, neredeyse boş. */
  pause: {
    mood: 'quiet',
    bg: '#F5F7F8',
    surface: '#FFFFFF',
    accent: '#5B7083',
    accentDeep: '#43566A',
    accentInk: '#FFFFFF',
    wash: '#E8EDF1',
    line: '#DEE5EA',
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
export function stageTheme(kind: StageKind): StageTheme {
  return BY_KIND[kind] ?? T.discussion
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
