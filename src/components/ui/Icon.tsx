import type { StageKind } from '../../lib/types'

/**
 * The icon set.
 *
 * Sixteen stop kinds used to be identified by emoji — 🤥 🩺 🕵️ — and that is
 * the loudest signal a piece of software can send that nobody drew anything.
 * Emoji also render as a different picture on every platform, sit on their own
 * baseline, ignore the text colour, and cannot be made to match a stroke
 * weight. They are somebody else's illustrations borrowed at 1.25rem.
 *
 * These are drawn on one 24-unit grid at one stroke weight, inherit
 * `currentColor`, and align to the type. Round caps and joins throughout: the
 * set reads as one hand rather than sixteen clip-art decisions.
 *
 * Emoji survive in exactly one place — a passenger's chosen avatar — because
 * there it IS the content, picked by a person, not iconography.
 */
export type IconName =
  | StageKind
  | 'play'
  | 'chevron'
  | 'close'
  | 'plus'
  | 'up'
  | 'down'
  | 'check'
  | 'clock'
  | 'people'
  | 'link'
  | 'download'
  | 'print'
  | 'route'
  | 'live'
  | 'refresh'
  | 'bus'

/** 24×24, stroke-based. Paths only — the wrapper supplies stroke and size. */
const PATHS: Record<string, React.ReactNode> = {
  // ---- stop kinds ----------------------------------------------------------
  /** a pinned card */
  board: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  /** a cup: lean coffee */
  lean_coffee: (
    <>
      <path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" />
      <path d="M16 10h2.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M7 3.5v1.5M11 3.5v1.5" />
    </>
  ),
  /** a lightbulb: suggestions */
  suggestions: (
    <>
      <path d="M9 17.5h6M10 20.5h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.3.3.5.7.5 1.1v.5h6v-.5c0-.4.2-.8.5-1.1A6 6 0 0 0 12 3Z" />
    </>
  ),
  /** bars: a poll */
  poll: (
    <>
      <path d="M5 20V11M12 20V4M19 20v-6" />
    </>
  ),
  /** overlapping words: the cloud */
  wordcloud: (
    <>
      <path d="M7 16h9.5a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7.5 9 3.5 3.5 0 0 0 7 16Z" />
      <path d="M9.5 12.5h5" />
    </>
  ),
  /** two ticks and a cross: two truths, one lie */
  two_truths: (
    <>
      <path d="M4 7.5 5.8 9.3 9 6" />
      <path d="M4 14.5 5.8 16.3 9 13" />
      <path d="M13 6.5l6 6M19 6.5l-6 6" />
      <path d="M13 17h6" />
    </>
  ),
  /** a pulse line */
  health_check: (
    <>
      <path d="M3 12h4l2.5-6 4 12L16 12h5" />
    </>
  ),
  /** a trophy */
  quiz: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5.5H5.5A2.5 2.5 0 0 0 8 10M16 5.5h2.5A2.5 2.5 0 0 1 16 10" />
      <path d="M12 13v3M9 20h6M10.5 16.5h3" />
    </>
  ),
  /** a speech bubble with a hidden mark: the lie */
  fibbage: (
    <>
      <path d="M20 12a7 7 0 0 1-7 7H8l-4 2 1.2-3.6A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7Z" />
      <path d="M9.5 11.5h5" />
    </>
  ),
  /** ordered list: rank */
  rank: (
    <>
      <path d="M10 7h10M10 12h10M10 17h10" />
      <path d="M4 6.5 5.5 5.5V9M4 17.5h3l-3 3h3" />
    </>
  ),
  /** a 5×5 grid: the codenames board */
  codenames: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15M15 4.5v15M3.5 9.5h17M3.5 14.5h17" />
    </>
  ),
  /** a dial: wavelength */
  wavelength: (
    <>
      <path d="M4 17a8 8 0 0 1 16 0" />
      <path d="M12 17l4.5-5" />
      <path d="M4 20h16" />
    </>
  ),
  /** an envelope with a heart: the feedback wall */
  feedback_wall: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M4 8l7.2 4.8a1.5 1.5 0 0 0 1.6 0L20 8" />
    </>
  ),
  /** a medal */
  leaderboard: (
    <>
      <circle cx="12" cy="14.5" r="5" />
      <path d="M12 12.5v4M10.2 14.5h3.6" />
      <path d="M8.5 9 6.5 3.5h11L15.5 9" />
    </>
  ),
  /** an eye, half closed: the secret mission */
  secret_mission: (
    <>
      <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  /** a paused clock: the break */
  break: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 9.5v5M14 9.5v5" />
    </>
  ),

  // ---- interface -----------------------------------------------------------
  play: <path d="M8 5.5v13l10-6.5-10-6.5Z" />,
  chevron: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  check: <path d="M4.5 12.5 9 17l10.5-10" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M3 19.5a6 6 0 0 1 12 0" />
      <path d="M16 5.6a3.5 3.5 0 0 1 0 5.8M17.5 19.5a6 6 0 0 0-2.2-4.7" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 7" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 1 0 11 18.7l1.5-1.5" />
    </>
  ),
  download: <path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M4.5 19.5h15" />,
  print: (
    <>
      <path d="M7 9V4h10v5" />
      <path d="M7 16H5.5A1.5 1.5 0 0 1 4 14.5v-4A1.5 1.5 0 0 1 5.5 9h13A1.5 1.5 0 0 1 20 10.5v4a1.5 1.5 0 0 1-1.5 1.5H17" />
      <rect x="7" y="13.5" width="10" height="6.5" rx="1" />
    </>
  ),
  route: (
    <>
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="M6.5 9v4a4 4 0 0 0 4 4h4" />
    </>
  ),
  live: <circle cx="12" cy="12" r="4" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  /** The brand mark, drawn. A 🚌 at 64px is somebody else's illustration; this
      is ours, and it takes the text colour like everything else in the set. */
  bus: (
    <>
      <path d="M4 16.5V7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9" />
      <path d="M4 11.5h16" />
      <path d="M3 16.5h18" />
      <circle cx="8" cy="18.5" r="1.6" />
      <circle cx="16" cy="18.5" r="1.6" />
      <path d="M8 8h3M13 8h3" />
    </>
  ),
}

export default function Icon({
  name,
  size = 20,
  className = '',
  strokeWidth = 1.6,
}: {
  name: IconName | string
  size?: number
  className?: string
  /** 1.6 is the set's weight; only the projected screen goes lighter */
  strokeWidth?: number
}) {
  const d = PATHS[name] ?? PATHS.board
  const solid = name === 'play' || name === 'live'
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={solid ? 'currentColor' : 'none'}
      stroke={solid ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['shrink-0', className].join(' ')}
      aria-hidden
      focusable="false"
    >
      {d}
    </svg>
  )
}
