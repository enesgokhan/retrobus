// Client side of the anonymity contract.
//
// Every anonymous write goes through an RPC (never a direct table insert), so
// the server decides what gets recorded and the per-person ledger stays in the
// same transaction as the content. Reads always order by sort_seed — never by
// id or a timestamp — so display order carries no information about who
// submitted when.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Card {
  id: string
  stage_id: string
  column_key: string | null
  body: string
  author_member_id: string | null
  sort_seed: number
  group_parent_id: string | null
  hidden: boolean
}

export interface Poll {
  id: string
  stage_id: string | null
  meeting_id: string | null
  question: string
  kind: 'single' | 'multi' | 'scale5' | 'scale10'
  options: string[]
  reveal: 'batch' | 'live'
  state: 'draft' | 'open' | 'revealed' | 'closed'
}

/** Translates the RPCs' error codes into something the UI can act on. */
export type SubmitError = 'limit' | 'not_open' | 'range' | 'auth' | 'unknown'

function classify(err: { code?: string; message?: string } | null): SubmitError {
  if (!err) return 'unknown'
  const msg = err.message ?? ''
  if (err.code === 'P0001' || msg.includes('limit reached')) return 'limit'
  if (err.code === 'P0002' || msg.includes('not open') || msg.includes('unknown')) return 'not_open'
  if (err.code === 'P0003' || msg.includes('out of range')) return 'range'
  if (err.code === '28000' || msg.includes('not authenticated')) return 'auth'
  return 'unknown'
}

export async function submitCard(
  sb: SupabaseClient,
  args: { stageId: string; body: string; columnKey?: string | null; max?: number },
): Promise<SubmitError | null> {
  const { error } = await sb.rpc('submit_card', {
    p_stage_id: args.stageId,
    p_body: args.body,
    p_column_key: args.columnKey ?? null,
    p_max: args.max ?? 20,
  })
  return error ? classify(error) : null
}

export async function castDot(sb: SupabaseClient, cardId: string): Promise<SubmitError | null> {
  const { error } = await sb.rpc('cast_dot', { p_card_id: cardId })
  return error ? classify(error) : null
}

export async function submitPollResponse(
  sb: SupabaseClient,
  pollId: string,
  choice: number,
): Promise<SubmitError | null> {
  const { error } = await sb.rpc('submit_poll_response', { p_poll_id: pollId, p_choice: choice })
  return error ? classify(error) : null
}

/** Cards for a stage, in random-seed order (the only safe ordering). */
export async function fetchCards(sb: SupabaseClient, stageId: string): Promise<Card[]> {
  const { data } = await sb
    .from('cards')
    .select('id, stage_id, column_key, body, author_member_id, sort_seed, group_parent_id, hidden')
    .eq('stage_id', stageId)
    .order('sort_seed')
  return (data as Card[]) ?? []
}

/** Dot tallies per card for a stage. */
export async function fetchDotCounts(sb: SupabaseClient, stageId: string): Promise<Record<string, number>> {
  const { data } = await sb.from('votes').select('card_id').eq('stage_id', stageId)
  const counts: Record<string, number> = {}
  for (const row of (data as { card_id: string }[]) ?? []) {
    counts[row.card_id] = (counts[row.card_id] ?? 0) + 1
  }
  return counts
}

/** How many of an action the caller has already spent on this stage. */
export async function fetchMyUsage(
  sb: SupabaseClient,
  stageId: string,
  actionKey: string,
): Promise<number> {
  const { data } = await sb
    .from('participation')
    .select('count')
    .eq('stage_id', stageId)
    .eq('action_key', actionKey)
    .maybeSingle()
  return (data as { count: number } | null)?.count ?? 0
}
