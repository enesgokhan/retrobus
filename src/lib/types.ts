// Domain types — mirror of supabase/migrations schema.

export type StageKind =
  | 'wordcloud'
  | 'two_truths'
  | 'health_check'
  | 'lean_coffee'
  | 'board'
  | 'poll'
  | 'feedback_wall'
  | 'suggestions'
  | 'quiz'
  | 'codenames'
  | 'wavelength'
  | 'leaderboard'
  | 'break'

export type StageState = 'pending' | 'open' | 'revealed' | 'closed'
export type MeetingStatus = 'draft' | 'live' | 'done'

export interface Member {
  id: string
  display_name: string
  is_host: boolean
  avatar?: string | null
}

export interface Meeting {
  id: string
  title: string
  status: MeetingStatus
  active_stage_id: string | null
  created_at: string
}

/** Per-stage knobs. Only the keys a given kind cares about are set. */
export interface StageConfig {
  /** anonymous or named cards (host picks per board) */
  identity?: 'anon' | 'named'
  /** batch = hidden until reveal, live = visible as they land */
  reveal?: 'batch' | 'live'
  /** dot-vote allowance per person */
  dots?: number
  /** configurable prompt/reminder banner shown above the stage */
  prompt?: string
  /** default countdown seconds for this stage */
  timer_s?: number
  /** board column definitions: [{key,label}] */
  columns?: { key: string; label: string }[]
  [key: string]: unknown
}

export interface Stage {
  id: string
  meeting_id: string
  kind: StageKind
  title: string
  order_index: number
  config: StageConfig
  state: StageState
  opened_at: string | null
  /** when a countdown is running, its absolute end */
  timer_ends_at: string | null
  /** when paused, seconds left on the clock */
  timer_remaining_s: number | null
}
