// Phase 6: Secret Mission secrecy, host freeze, awards.
import { hostClient, client, claim } from './_clients.mjs'


let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const host = await hostClient()

const names = ['Ayse', 'Baris', 'Ceyda']
const codes = ['111111', '222222', '333333']
for (const n of names) await host.from('members').insert({ display_name: n })
const { data: roster } = await host.from('members').select('id, display_name')
const idOf = (n) => roster.find((r) => r.display_name === n).id
for (let i = 0; i < names.length; i++) {
  await host.rpc('set_member_code', { p_member_id: idOf(names[i]), p_code: codes[i] })
}
const c = {}
for (const [i, n] of names.entries()) {
  const cl = await client(`member${i + 1}`)
  await claim(cl, n, codes[i])
  c[n] = cl
}
const { data: meeting } = await host.from('meetings')
  .insert({ title: 'Faz6 Testi', status: 'live' }).select().single()

// ============ FREEZE ============
console.log('\n-- dondurma (panik butonu) --')
await await c.Ayse.from('meetings').update({ frozen: true }).eq('id', meeting.id)
const { data: afterPax } = await host.from('meetings').select('frozen').eq('id', meeting.id).single()
if (afterPax.frozen) fail('a passenger managed to freeze the meeting')
else ok('only the host can freeze')

await host.from('meetings').update({ frozen: true, frozen_note: 'Beş dakika ara' }).eq('id', meeting.id)
const { data: seen } = await c.Ayse.from('meetings').select('frozen, frozen_note').eq('id', meeting.id).single()
if (!seen.frozen || seen.frozen_note !== 'Beş dakika ara') fail('freeze state not visible to passengers')
else ok('freeze state and note reach every client')
await host.from('meetings').update({ frozen: false, frozen_note: null }).eq('id', meeting.id)
ok('unfreeze works')

// ============ SECRET MISSION ============
console.log('\n-- gizli görev --')
const pool = ['Birine kahve dedirt.', 'Birini güldür.', 'Bir atasözü kullan.']
const sneakyAssign = await c.Ayse.rpc('assign_missions', { p_meeting_id: meeting.id, p_pool: pool })
if (!sneakyAssign.error) fail('non-host must not assign missions')
else ok('assigning is host-only')

const assigned = await host.rpc('assign_missions', { p_meeting_id: meeting.id, p_pool: pool })
if (assigned.error) { fail(`assign: ${assigned.error.message}`); process.exit(1) }
if (assigned.data < 3) fail(`expected at least 3 missions, got ${assigned.data}`)
else ok(`${assigned.data} missions assigned`)

// each player sees exactly ONE mission: their own
for (const n of names) {
  const { data, error } = await c[n].from('missions').select('member_id, body').eq('meeting_id', meeting.id)
  if (error) {
    fail(`${n} mission query errored: ${error.message}`)
  } else if ((data ?? []).length !== 1) {
    fail(`${n} should see exactly 1 mission, saw ${data?.length}`)
  } else if (data[0].member_id !== idOf(n)) {
    fail(`${n} saw someone else's mission`)
  }
}
ok('each player sees exactly their own mission, nobody else\'s')

// the host must not see assignments either
const hostPeek = await host.from('missions').select('member_id, body').eq('meeting_id', meeting.id)
const notHostOwn = (hostPeek.data ?? []).filter((m) => m.member_id !== idOf('Enes'))
if (notHostOwn.length) fail(`host saw ${notHostOwn.length} other people's missions before reveal`)
else ok('host cannot see who got which mission before reveal')

// mark one done, then reveal
const { data: ayseMission } = await c.Ayse.from('missions').select('id').eq('meeting_id', meeting.id).single()
await await c.Baris.from('missions').update({ completed: true }).eq('id', ayseMission.id)
const { data: stillNull } = await c.Ayse.from('missions').select('completed').eq('id', ayseMission.id).single()
if (stillNull.completed === true) fail('a passenger marked a mission complete')
else ok('only the host can mark a mission complete')

// The host cannot mark a mission before reveal, because they cannot SEE it —
// RLS hides assignments from them by design, and an UPDATE ... WHERE has to
// find the row through the SELECT policy first. So the real order is
// reveal -> mark -> score, which is exactly what the UI does.
await await host.from('missions').update({ completed: true }).eq('id', ayseMission.id)
const { data: notYet } = await c.Ayse.from('missions').select('completed').eq('id', ayseMission.id).single()
if (notYet.completed === true) fail('host marked a mission before reveal despite not being able to see it')
else ok('host cannot mark before reveal (cannot see the row)')

const revealed = await host.rpc('reveal_missions', { p_meeting_id: meeting.id })
if (revealed.error) fail(`reveal_missions: ${revealed.error.message}`)
else ok(`${revealed.data} missions revealed`)

const allSeen = await c.Baris.from('missions').select('member_id').eq('meeting_id', meeting.id)
if ((allSeen.data ?? []).length < 3) fail(`after reveal all should be visible, saw ${allSeen.data?.length}`)
else ok('every mission visible after reveal')

// now the host can mark it, then score with a second reveal call
await host.from('missions').update({ completed: true }).eq('id', ayseMission.id)
const { data: marked } = await host.from('missions').select('completed').eq('id', ayseMission.id).single()
if (marked.completed !== true) fail('host should be able to mark after reveal')
else ok('host can mark complete after reveal')
await host.rpc('reveal_missions', { p_meeting_id: meeting.id })

const { data: mScores } = await host.from('scores')
  .select('member_id, points, reason').eq('meeting_id', meeting.id).eq('reason', 'mission_done')
if ((mScores ?? []).length !== 1) fail(`only the completed mission scores, got ${mScores?.length}`)
else if (mScores[0].member_id !== idOf('Ayse')) fail('wrong member scored')
else if (mScores[0].points !== 800) fail(`expected 800, got ${mScores[0].points}`)
else ok('completed mission awards 800 to the right person')

// re-revealing must not double-award
await host.rpc('reveal_missions', { p_meeting_id: meeting.id })
const { data: again } = await host.from('scores')
  .select('id').eq('meeting_id', meeting.id).eq('reason', 'mission_done')
if ((again ?? []).length !== 1) fail(`double-award on second reveal: ${again?.length} rows`)
else ok('reveal is idempotent (no double award)')

// ============ AWARDS ============
console.log('\n-- ödüller --')
// seed a spread of scores so several awards resolve
const st = await host.from('stages')
  .insert({ meeting_id: meeting.id, kind: 'quiz', title: 'q', order_index: 1 }).select().single()
const stageId = st.data.id
// (clients cannot insert scores — this uses the host, which also cannot; so we
// drive scores through a real scoring path instead)
const { data: q } = await host.from('quiz_questions').insert({
  stage_id: stageId, meeting_id: meeting.id, kind: 'choice',
  prompt: 'test?', options: ['a', 'b'], time_limit_s: 30, base_points: 1000,
}).select().single()
await host.from('quiz_keys').insert({ question_id: q.id, correct_index: 0 })
await host.rpc('open_quiz', { p_question_id: q.id })
await c.Baris.rpc('answer_quiz', { p_question_id: q.id, p_choice_index: 0 })
await c.Ceyda.rpc('answer_quiz', { p_question_id: q.id, p_choice_index: 1 })
await host.rpc('reveal_quiz', { p_question_id: q.id })

const aw = await c.Ayse.rpc('awards', { p_meeting_id: meeting.id })
if (aw.error) fail(`awards: ${aw.error.message}`)
else {
  const keys = (aw.data ?? []).map((a) => a.key)
  if (!keys.includes('champion')) fail(`no champion award: ${JSON.stringify(keys)}`)
  else if (!keys.includes('quiz')) fail('no quiz award despite quiz scores')
  else ok(`awards resolve: ${(aw.data ?? []).map((a) => `${a.label}=${a.display_name}`).join(', ')}`)
}

// ============ cleanup ============
await host.from('meetings').delete().eq('id', meeting.id)
for (const n of names) await host.from('members').delete().eq('display_name', n)
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
