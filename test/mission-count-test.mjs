// The host may know HOW MANY missions are out, and nothing else about them.
//
// `missions_select` hands you your own mission, or any mission once revealed.
// The host is deliberately not exempt: a host who knows the assignments steers
// the evening without meaning to. So `missions.length` in the browser is at
// most one, and two screens read it as if it were the room's — the console
// reported "0 atanmış" after a clean deal, and the shared screen told everyone
// the missions had never been handed out while they were all holding one.
//
// The console one is the dangerous half. `assign_missions` deletes every
// unrevealed mission before dealing, so a host reading "0 atanmış" at the
// finale has every reason to press the button beside it.
//
// This asserts both halves of `mission_count`: that it counts, and that it is
// ONLY a count — the assignments must stay as sealed from the host afterwards
// as they were before.
import { hostClient, testMembers } from './_clients.mjs'

let problems = 0
const bad = (m) => { problems++; console.log(`  ✗ ${m}`) }
const ok = (m) => console.log(`  ✓ ${m}`)

const api = await hostClient()
const { clients } = await testMembers(api, 2)

await api.from('meetings').delete().eq('title', 'MissionCount')
const { data: meeting } = await api
  .from('meetings')
  .insert({ title: 'MissionCount', status: 'live' })
  .select()
  .single()

const count = async (client) => {
  const { data, error } = await client.rpc('mission_count', { p_meeting_id: meeting.id })
  if (error) { bad(`mission_count errored: ${error.message}`); return -1 }
  return data ?? 0
}

console.log('\n-- before dealing --')
{
  const n = await count(api)
  if (n !== 0) bad(`nothing has been dealt and the count says ${n}`)
  else ok('zero, so the console will correctly offer to deal')
}

console.log('\n-- after dealing --')
const { data: dealt, error: aErr } = await api.rpc('assign_missions', {
  p_meeting_id: meeting.id,
  p_pool: ['Birine iltifat et', 'Üç kez "kesinlikle" de', 'Kamerayı bir kez kapat'],
})
if (aErr) bad(`could not deal: ${aErr.message}`)
{
  // CONTROL: the deal actually happened, and to more than one person — the
  // whole point is that the count exceeds what the reader can SELECT.
  if ((dealt ?? 0) < 2) {
    bad(`CONTROL FAILED: assign_missions dealt ${dealt} mission(s); this test needs at least 2 to mean anything`)
  } else ok(`control: ${dealt} missions dealt`)

  const n = await count(api)
  if (n !== dealt) bad(`dealt ${dealt} but the host's count says ${n} — the console will misreport and may re-roll`)
  else ok(`the host sees ${n}, which is the truth`)

  const { data: rows } = await api.from('missions').select('id').eq('meeting_id', meeting.id)
  if ((rows ?? []).length >= dealt) {
    bad(`the host can SELECT ${(rows ?? []).length} of ${dealt} missions — the assignments are no longer sealed`)
  } else ok(`the host can still only read ${(rows ?? []).length} row(s) — the sealing is intact`)
}

console.log('\n-- and it stays a count --')
{
  // a passenger gets the same number and no more
  const n = await count(clients.Test1)
  if (n !== dealt) bad(`a passenger's count is ${n}, not ${dealt}`)
  else ok('a passenger sees the same number')

  const { data: rows } = await clients.Test1.from('missions').select('body').eq('meeting_id', meeting.id)
  const bodies = (rows ?? []).map((r) => r.body)
  if (bodies.length > 1) bad(`a passenger can read ${bodies.length} mission bodies`)
  else ok(`a passenger reads ${bodies.length} mission body — their own`)
}

await api.from('meetings').delete().eq('id', meeting.id)
console.log(problems ? `\n${problems} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(problems ? 1 : 0)
