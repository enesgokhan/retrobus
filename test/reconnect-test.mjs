// Verifies the two properties liveChannel() claims, since both are the
// difference between the app working and not working on the day:
//
//   1. a change written immediately after subscribe() must not be lost
//   2. after a channel drop and rejoin, state must be recovered
//
// Both rely on refetching on every SUBSCRIBED, so the test asserts that the
// refetch actually happens and that the fetched state is correct — not merely
// that an event arrived.
import { hostClient, client, claim } from './_clients.mjs'

let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const host = await hostClient()
await host.from('members').insert({ display_name: 'Test1' })
const { data: roster } = await host.from('members').select('id, display_name')
const t1 = roster.find((r) => r.display_name === 'Test1')
await host.rpc('set_member_code', { p_member_id: t1.id, p_code: '111111' })
const pax = await client('member1')
await claim(pax, 'Test1', '111111')

const { data: meeting } = await host.from('meetings')
  .insert({ title: 'Reconnect Testi', status: 'live' }).select().single()
const { data: s1 } = await host.from('stages')
  .insert({ meeting_id: meeting.id, kind: 'break', title: 'Durak 1', order_index: 1 })
  .select().single()
const { data: s2 } = await host.from('stages')
  .insert({ meeting_id: meeting.id, kind: 'break', title: 'Durak 2', order_index: 2 })
  .select().single()
await host.from('meetings').update({ active_stage_id: s1.id }).eq('id', meeting.id)

/**
 * Mirrors src/lib/realtime.ts: refetch on every SUBSCRIBED, not just on events.
 * If this test and that file ever diverge, this test is worthless — keep them
 * in step.
 */
function liveChannel(sb, name, tables, onChange) {
  let ch = sb.channel(name)
  for (const table of tables) {
    ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
  }
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') onChange()
  })
  return ch
}

// ---------- 1. no gap between fetch and subscribe ----------
console.log('\n-- abonelik yarışı --')
let seenStage = null
let refetches = 0
async function load() {
  refetches++
  const { data } = await pax.from('meetings').select('active_stage_id').eq('id', meeting.id).single()
  seenStage = data?.active_stage_id ?? null
}

// Deliberately the racy order the app uses: fetch, then subscribe. Then write
// IMMEDIATELY, inside the window where a plain subscription drops changes.
const ch = liveChannel(pax, 'reconnect-test', ['meetings'], load)
await host.from('meetings').update({ active_stage_id: s2.id }).eq('id', meeting.id)

await sleep(6000)
if (seenStage !== s2.id) {
  fail(`client did not converge on the new stage (saw ${seenStage === s1.id ? 'stage 1' : seenStage})`)
} else {
  ok(`converged on the new stage despite writing inside the subscribe window (${refetches} refetches)`)
}

// ---------- 2. reconnect recovery ----------
console.log('\n-- yeniden bağlanma --')
await pax.removeChannel(ch)
await sleep(500)

// while "offline", the host advances the meeting
await host.from('meetings').update({ active_stage_id: s1.id }).eq('id', meeting.id)
await host.from('stages').update({ state: 'open' }).eq('id', s1.id)
await sleep(500)

// stale on purpose: nothing is listening
seenStage = null
const before = refetches
const ch2 = liveChannel(pax, 'reconnect-test-2', ['meetings'], load)
await sleep(6000)

if (refetches <= before) {
  fail('rejoining did not trigger a refetch')
} else if (seenStage !== s1.id) {
  fail(`did not recover the state missed while offline (saw ${seenStage})`)
} else {
  ok('rejoining refetched and recovered the change missed while offline')
}

// ---------- 3. events still flow after rejoin ----------
await host.from('meetings').update({ active_stage_id: s2.id }).eq('id', meeting.id)
await sleep(4000)
if (seenStage !== s2.id) fail(`live events not flowing after rejoin (saw ${seenStage})`)
else ok('live events flow normally after rejoin')

await pax.removeChannel(ch2)
await host.from('meetings').delete().eq('id', meeting.id)
await host.from('members').delete().eq('display_name', 'Test1')
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
