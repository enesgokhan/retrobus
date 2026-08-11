// Revealing a stop has to reveal what is on it.
//
// The console's one big button — "Sonuçları aç" — sets `stages.state` to
// 'revealed'. PollStage was taught to honour that:
//
//   PollStage.tsx  const stageRevealed = stage.state === 'revealed' || 'closed'
//                  const showResults = poll.state === … || stageRevealed
//
// but `poll_responses_select` was not. It still asks only about the POLL:
//
//   0002_discussion.sql  p.state in ('revealed','closed') or p.reveal = 'live'
//
// So the host presses the most obvious button in the app, every screen switches
// into results mode, and the database hands back nothing — which does not look
// like an error, it looks like an answer. Everyone sees 0%, and the honest
// reading of that screen is "nobody voted".
//
// This is the same shape as the hidden-card leak, run backwards: there the UI
// hid what the database sent, here the UI shows what the database withholds.
// Both come from two places holding separate opinions about one decision.
//
// Every assertion is paired with a control, because "no rows" is exactly what a
// broken query returns too.
import { hostClient, testMembers } from './_clients.mjs'

let problems = 0
const bad = (m) => { problems++; console.log(`  ✗ ${m}`) }
const ok = (m) => console.log(`  ✓ ${m}`)

const api = await hostClient()
const { clients } = await testMembers(api, 2)
const [a, b] = [clients.Test1, clients.Test2]

await api.from('meetings').delete().eq('title', 'RevealPoll')
const { data: meeting } = await api
  .from('meetings')
  .insert({ title: 'RevealPoll', status: 'live' })
  .select()
  .single()

const { data: stage } = await api
  .from('stages')
  .insert({
    meeting_id: meeting.id,
    kind: 'poll',
    title: 'Anket',
    order_index: 1,
    config: {},
    state: 'open',
  })
  .select()
  .single()

const { data: poll, error: pErr } = await api
  .from('polls')
  .insert({
    meeting_id: meeting.id,
    stage_id: stage.id,
    question: 'Hangisi?',
    kind: 'single',
    options: ['Bir', 'İki'],
    reveal: 'batch',
    state: 'open',
  })
  .select()
  .single()
if (pErr) bad(`could not create the poll: ${pErr.message}`)

console.log('\n-- two people vote --')
for (const [who, client, choice] of [['Test1', a, 0], ['Test2', b, 1]]) {
  const { error } = await client.rpc('submit_poll_response', { p_poll_id: poll.id, p_choice: choice })
  if (error) bad(`${who} could not vote: ${error.message}`)
}
{
  // CONTROL: the host can see both votes, so the rows exist and the write path
  // works. Without this, every "0 rows" below could just be a failed insert.
  const { data } = await api.from('poll_responses').select('choice').eq('poll_id', poll.id)
  if ((data ?? []).length !== 2) bad(`CONTROL FAILED: the host sees ${(data ?? []).length} vote(s), not 2 — nothing below can be trusted`)
  else ok('control: both votes are in the table')
}

// PollStage restores "you already voted" by reading this ledger on load, because
// it used to live only in component state and a reload re-offered every poll.
// The whole fix rests on a member being able to read their OWN participation
// rows; if `participation_select_own` returned nothing the screen would look
// exactly as it did before, so this is asserted rather than assumed.
console.log('\n-- a voter can read their own ledger back --')
{
  const { data: mine } = await a
    .from('participation')
    .select('action_key, count')
    .eq('stage_id', stage.id)
  const keys = (mine ?? []).map((r) => r.action_key)
  if (!keys.includes(`poll:${poll.id}`)) {
    bad(`the voter cannot see their own vote in the ledger (${keys.length} row(s)) — the screen would offer the poll again after a reload`)
  } else ok('the ledger says this poll is done, so a reload will not re-offer it')

  // CONTROL: it is one member's ledger, not the room's. Test2 voted too; if
  // this check could see that, it would be reading everyone's history.
  const { data: theirs } = await a
    .from('participation')
    .select('member_id')
    .eq('stage_id', stage.id)
  const owners = new Set((theirs ?? []).map((r) => r.member_id))
  if (owners.size > 1) bad(`the ledger returned ${owners.size} members' rows — it should only ever be your own`)
  else ok('control: the ledger is scoped to the reader')
}

console.log('\n-- while the stop is open, a passenger sees no votes --')
{
  const { data } = await a.from('poll_responses').select('choice').eq('poll_id', poll.id)
  if ((data ?? []).length) bad(`votes leaked before the reveal: ${(data ?? []).length} row(s)`)
  else ok('nothing readable yet, which is the point of a batch reveal')
}

console.log('\n-- the host presses "Sonuçları aç" (stage → revealed) --')
await api.from('stages').update({ state: 'revealed' }).eq('id', stage.id)
{
  const { data: fresh } = await api.from('polls').select('state').eq('id', poll.id).single()
  console.log(`  the poll's own state is still "${fresh.state}"`)
  const { data } = await a.from('poll_responses').select('choice').eq('poll_id', poll.id)
  const n = (data ?? []).length
  if (n !== 2) {
    bad(`the room is in results mode and receives ${n} of 2 votes — every screen reads 0%`)
  } else ok('the passenger receives both votes, so the results are real')
}

console.log('\n-- and closing the stop behaves the same way --')
await api.from('stages').update({ state: 'closed' }).eq('id', stage.id)
{
  const { data } = await b.from('poll_responses').select('choice').eq('poll_id', poll.id)
  const n = (data ?? []).length
  if (n !== 2) bad(`after closing, a passenger receives ${n} of 2 votes`)
  else ok('closed reads the same as revealed')
}

await api.from('meetings').delete().eq('id', meeting.id)
console.log(problems ? `\n${problems} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(problems ? 1 : 0)
