// Every progress key the app asks for must be a key the database will count.
//
// `stage_progress` is deliberately allow-listed (0017, narrowed in 0019): it is
// a counting oracle over the anonymity ledger, and the feedback wall writes
// 'fb:<member_id>', so an arbitrary key would let anyone count how many people
// wrote about a named colleague. That restriction is right and stays.
//
// The trap is its FAILURE MODE. A refused key returns 0 — the same answer as a
// key nobody has used yet. So asking for a key that is not on the list produces
// a screen that says "0 of 9 have answered", forever, with no error anywhere:
// in the console, in the network tab, or in the types. That is exactly how the
// health check's shared screen was built reading 0/9 against twenty-four real
// answers, and nothing in the codebase could have told me otherwise.
//
// This closes that gap from the app's side: for every key the app actually
// asks for, perform the real action and assert the count moves. The CONTROL is
// a key that must stay refused — without it, a version of this function that
// returned a count for anything would pass every assertion here while quietly
// re-opening the hole 0017 closed.
import { hostClient, testMembers } from './_clients.mjs'

let problems = 0
const bad = (m) => { problems++; console.log(`  ✗ ${m}`) }
const ok = (m) => console.log(`  ✓ ${m}`)

const api = await hostClient()
const { clients, idOf } = await testMembers(api, 1)
const guest = clients.Test1

await api.from('meetings').delete().eq('title', 'ProgressKeys')
const { data: meeting } = await api
  .from('meetings')
  .insert({ title: 'ProgressKeys', status: 'live' })
  .select()
  .single()

const addStage = async (kind, order) => {
  const { data } = await api
    .from('stages')
    .insert({ meeting_id: meeting.id, kind, title: kind, order_index: order, config: {}, state: 'open' })
    .select()
    .single()
  return data
}
const progress = async (stageId, key) => {
  const { data, error } = await guest.rpc('stage_progress', { p_stage_id: stageId, p_action_key: key })
  if (error) bad(`stage_progress(${key}) errored: ${error.message}`)
  return data ?? 0
}

// -------------------------------------------------------- board: card, dot ---
console.log('\n-- the board counts writers and voters --')
{
  const stage = await addStage('board', 1)
  const { error } = await guest.rpc('submit_card', {
    p_stage_id: stage.id, p_body: 'sayılsın', p_column_key: null, p_max: 20,
  })
  if (error) bad(`could not write a card: ${error.message}`)

  const n = await progress(stage.id, 'card')
  if (n < 1) bad(`BoardStage asks for "card" and the database answers ${n} — the host's "kim yazdı" reads zero all phase`)
  else ok(`"card" counts (${n})`)

  const { data: cards } = await api.from('cards').select('id').eq('stage_id', stage.id)
  const { error: dErr } = await guest.rpc('cast_dot', { p_card_id: cards[0].id })
  if (dErr) bad(`could not cast a dot: ${dErr.message}`)
  const d = await progress(stage.id, 'dot')
  if (d < 1) bad(`BoardStage asks for "dot" and the database answers ${d}`)
  else ok(`"dot" counts (${d})`)
}

// ------------------------------------------------ health: health:<dimension> ---
console.log('\n-- the shared screen counts health answers, per dimension --')
{
  const stage = await addStage('health_check', 2)
  const { error } = await guest.rpc('submit_health', {
    p_stage_id: stage.id, p_dimension_key: 'fun', p_rating: 3,
  })
  if (error) bad(`could not answer: ${error.message}`)

  // CONTROL: the answer really is in the ledger, so a 0 below is the function
  // refusing the key and not an insert that quietly failed.
  const { data: own } = await guest
    .from('participation')
    .select('action_key')
    .eq('stage_id', stage.id)
  if (!(own ?? []).some((r) => r.action_key === 'health:fun')) {
    bad('CONTROL FAILED: the answer is not in the ledger — nothing below is a test of stage_progress')
  } else ok('control: the answer is in the ledger under "health:fun"')

  const n = await progress(stage.id, 'health:fun')
  if (n < 1) {
    bad(`HealthCheckStage asks for "health:fun" and the database answers ${n} — the shared screen reads 0/N while the room votes (run migration 0023)`)
  } else ok(`"health:fun" counts (${n})`)

  // a dimension nobody answered is genuinely zero, and must stay distinguishable
  const z = await progress(stage.id, 'health:speed')
  if (z !== 0) bad(`an unanswered dimension counted ${z}`)
  else ok('an unanswered dimension is zero, as it should be')
}

// ------------------------------------------------------------- the control ---
// Keys that name a PERSON or an ANSWER must stay refused. If this ever counts,
// the allow-list has been widened past what it can safely say.
console.log('\n-- keys that would leak must still refuse --')
{
  const stage = await addStage('feedback_wall', 3)
  await api.from('stages').update({ state: 'open' }).eq('id', stage.id)
  const target = idOf('Enes')
  const { error } = await guest.rpc('submit_feedback', {
    p_stage_id: stage.id, p_target_member_id: target, p_kind: 'kudos', p_body: 'sayılmasın',
  })
  if (error) bad(`could not write feedback: ${error.message}`)

  const leak = await progress(stage.id, `fb:${target}:kudos`)
  if (leak !== 0) {
    bad(`LEAK: counting "fb:<member_id>" returned ${leak} — anyone can now count how many people wrote about a named colleague`)
  } else ok('a key naming a person still counts zero')

  const poll = await progress(stage.id, 'poll:whatever:1')
  if (poll !== 0) bad(`counting a poll choice returned ${poll} — that is the running result of a sealed poll`)
  else ok('a key naming an answer still counts zero')
}

await api.from('meetings').delete().eq('id', meeting.id)
console.log(problems ? `\n${problems} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(problems ? 1 : 0)
