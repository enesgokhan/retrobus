// Joining by room code — and, more importantly, what it must NOT allow.
//
// This is the one path where someone with no invitation creates a row in the
// members table, so it is the path worth being paranoid about. The rules it has
// to hold:
//
//   * possession of the code never grants host
//   * it never touches or adopts an existing member
//   * the same session rejoins rather than duplicating
//   * a closed door means closed
//   * nothing about the room is readable before you are in it
import { hostClient, client, claim } from './_clients.mjs'

let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const api = await hostClient()
await api.from('meetings').delete().eq('title', 'KodTesti')
await api.from('members').delete().eq('display_name', 'Kodcu')
await api.from('members').delete().eq('display_name', 'Sahtekar')

await api.from('meetings').update({ status: 'done', active_stage_id: null }).eq('status', 'live')
const { data: meeting } = await api.from('meetings')
  .insert({ title: 'KodTesti', status: 'live' }).select().single()

console.log('\n-- kod üretimi --')
{
  if (!meeting.join_code) fail('a new meeting has no join code')
  else if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(meeting.join_code)) {
    fail(`join code has an ambiguous or wrong-shaped value: ${meeting.join_code}`)
  } else ok(`meeting got a readable code: ${meeting.join_code}`)
  if (meeting.join_open !== true) fail('a new meeting starts closed')
  else ok('a new meeting starts open')
}

// a brand-new anonymous session, exactly like someone scanning the QR
const stranger = await client('joiner')

console.log('\n-- katılmadan önce ne görünüyor --')
{
  const { data: peek } = await stranger.rpc('peek_meeting', { p_code: meeting.join_code })
  if (!peek?.ok) fail('a valid code does not resolve')
  else if (peek.title !== 'KodTesti') fail('peek does not name the meeting')
  else ok('peek names the meeting and nothing else')
  const blob = JSON.stringify(peek)
  if (/member|code|id/i.test(blob.replace(/"(ok|title|open)"/g, ''))) {
    fail(`peek leaks more than it should: ${blob}`)
  } else ok('peek exposes only title and whether the door is open')

  const { data: bad } = await stranger.rpc('peek_meeting', { p_code: 'ZZZZZZ' })
  if (bad?.ok) fail('an unknown code resolves')
  else ok('an unknown code resolves to nothing')

  // and the room itself must be invisible until you are a member
  const { data: rows } = await stranger.from('members').select('id')
  if ((rows ?? []).length) fail(`a stranger can read the roster (${rows.length} rows)`)
  else ok('a stranger cannot read the roster')
}

console.log('\n-- katılma --')
let joinedId = null
{
  const { data: r } = await stranger.rpc('join_meeting', { p_code: meeting.join_code, p_name: 'Kodcu' })
  if (!r?.ok) fail(`joining failed: ${r?.reason}`)
  else { joinedId = r.member_id; ok('joined with a self-chosen name') }

  const { data: me } = await api.from('members').select('display_name, is_host').eq('id', joinedId).single()
  if (me?.display_name !== 'Kodcu') fail('the joined member has the wrong name')
  else ok('the name is the one they typed')
  // THE rule: a room code can never become control of the room
  if (me?.is_host) fail('joining by code granted host')
  else ok('joining never grants host')

  // and they can now see the room, because they are in it
  const { data: rows } = await stranger.from('members').select('id')
  if (!(rows ?? []).length) fail('a joined member still cannot read the roster')
  else ok('a joined member can read the roster')
}

console.log('\n-- aynı oturum tekrar --')
{
  const { data: again } = await stranger.rpc('join_meeting', { p_code: meeting.join_code, p_name: 'BaşkaAd' })
  if (!again?.ok) fail('rejoining failed')
  else if (again.member_id !== joinedId) fail('the same session got a second member row')
  else if (!again.rejoined) fail('a rejoin was not reported as one')
  else ok('the same session rejoins instead of duplicating')

  const { data: all } = await api.from('members').select('id').eq('display_name', 'Kodcu')
  if ((all ?? []).length !== 1) fail(`${all?.length} rows named Kodcu`)
  else ok('still exactly one row for them')
}

console.log('\n-- başkasının adını almaya çalışmak --')
{
  const impostor = await client('impostor')
  const { data: r } = await impostor.rpc('join_meeting', { p_code: meeting.join_code, p_name: 'Kodcu' })
  if (r?.ok && r.member_id === joinedId) {
    fail('a second person typing the same name TOOK OVER the existing member')
  } else if (r?.ok) {
    fail('a duplicate name was accepted — names are how the room tells people apart')
  } else if (r?.reason !== 'name_taken') {
    fail(`a taken name failed for the wrong reason: ${r?.reason}`)
  } else ok('a taken name is refused with a reason the screen can act on')

  // and it must still be free for the person who actually holds it
  const { data: other } = await impostor.rpc('join_meeting', { p_code: meeting.join_code, p_name: 'Sahtekar' })
  if (!other?.ok) fail(`a free name was refused: ${other?.reason}`)
  else if (other.member_id === joinedId) fail('joining adopted somebody else')
  else ok('a free name joins as a separate person')
  // the original session must still be itself
  const { data: who } = await stranger.rpc('join_meeting', { p_code: meeting.join_code, p_name: 'x' })
  if (who?.member_id !== joinedId) fail('the original session lost its identity')
  else ok('the original session is unaffected')
}

console.log('\n-- kapı kapalıyken --')
{
  await api.from('meetings').update({ join_open: false }).eq('id', meeting.id)
  const late = await client('late')
  const { data: r } = await late.rpc('join_meeting', { p_code: meeting.join_code, p_name: 'Geç' })
  if (r?.ok) fail('someone joined after the door was closed')
  else if (r?.reason !== 'closed') fail(`wrong reason for a closed door: ${r?.reason}`)
  else ok('a closed door refuses new people')

  const { data: peek } = await late.rpc('peek_meeting', { p_code: meeting.join_code })
  if (peek?.open !== false) fail('peek does not report the door as closed')
  else ok('peek reports the closed door, so the screen can say so')
  await api.from('meetings').update({ join_open: true }).eq('id', meeting.id)
}

console.log('\n-- yolcu kapıyı yönetemez --')
{
  // members_update_host gates every write to meetings; the join_open column
  // grant must not become a way around it
  const { error } = await stranger.from('meetings').update({ join_open: false }).eq('id', meeting.id)
  const { data: after } = await api.from('meetings').select('join_open').eq('id', meeting.id).single()
  if (after?.join_open === false) fail('a passenger closed the door')
  else ok(`a passenger cannot change the door (${error ? 'refused' : 'silently filtered'})`)

  const { error: e2 } = await stranger.from('meetings').update({ title: 'ele geçirildi' }).eq('id', meeting.id)
  const { data: t } = await api.from('meetings').select('title').eq('id', meeting.id).single()
  if (t?.title !== 'KodTesti') fail('a passenger renamed the meeting')
  else ok(`a passenger cannot rename the meeting (${e2 ? 'refused' : 'silently filtered'})`)
}

console.log('\n-- arşivlenmiş toplantıya katılmak --')
{
  await api.from('meetings').update({ status: 'done' }).eq('id', meeting.id)
  const ghost = await client('ghost')
  const { data: r } = await ghost.rpc('join_meeting', { p_code: meeting.join_code, p_name: 'Hayalet' })
  if (r?.ok) fail('someone joined a meeting that has ended')
  else ok('an archived meeting cannot be joined')
}

await api.from('meetings').delete().eq('id', meeting.id)
for (const n of ['Kodcu', 'Sahtekar', 'Geç', 'Hayalet', 'BaşkaAd', 'x']) {
  await api.from('members').delete().eq('display_name', n)
}
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
