// End-to-end discussion-hour test with multiple concurrent members.
import { hostClient, client, claim } from './_clients.mjs'


const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1 }
const ok = (m) => console.log('  ok:', m)

// --- host logs in ---
const host = await hostClient()
console.log('host claimed')

// --- host creates 3 passengers with codes ---
const names = ['Ayse', 'Baris', 'Ceyda']
const codes = ['111111', '222222', '333333']
for (const n of names) {
  await host.from('members').insert({ display_name: n })
}
const { data: roster } = await host.from('members').select('id, display_name')
for (let i = 0; i < names.length; i++) {
  const m = roster.find((r) => r.display_name === names[i])
  const { error } = await host.rpc('set_member_code', { p_member_id: m.id, p_code: codes[i] })
  if (error) fail(`set code for ${names[i]}: ${error.message}`)
}
ok('3 passengers created with codes')

// --- passengers log in ---
const pax = []
for (let i = 0; i < names.length; i++) {
  const c = await client(`member${i + 1}`)
  const r = { data: await claim(c, names[i], codes[i]) }
  if (!r.data?.ok) { fail(`login ${names[i]}: ${JSON.stringify(r.data ?? r.error?.message)}`); process.exit(1) }
  if (r.data.is_host) fail(`${names[i]} must NOT be host`)
  pax.push(c)
}
ok('3 passengers logged in, none host')

// --- host creates a meeting + an anonymous board, opens it ---
const { data: meeting } = await host.from('meetings')
  .insert({ title: 'Akış Testi', status: 'live' }).select().single()
const { data: stage } = await host.from('stages').insert({
  meeting_id: meeting.id, kind: 'board', title: 'Sancılar', order_index: 1,
  config: { identity: 'anon', reveal: 'batch', dots: 2 },
}).select().single()
await host.from('stages').update({ state: 'open' }).eq('id', stage.id)
await host.from('meetings').update({ active_stage_id: stage.id }).eq('id', meeting.id)
ok('meeting + anonymous board opened')

// --- concurrent submissions from all 3 ---
const results = await Promise.all(
  pax.map((c, i) => c.rpc('submit_card', {
    p_stage_id: stage.id, p_body: `kart-${i}`, p_column_key: 'blocked', p_max: 20,
  })),
)
results.forEach((r, i) => { if (r.error) fail(`submit ${i}: ${r.error.message}`) })
ok('3 concurrent anonymous submissions accepted')

// --- while batch+open, passengers must NOT see cards ---
const hidden = await pax[0].from('cards').select('id, body').eq('stage_id', stage.id)
if ((hidden.data ?? []).length !== 0) fail(`cards visible before reveal: ${hidden.data.length}`)
else ok('cards hidden from passengers while collecting (batch)')

// --- host CAN see them (needed for grouping) ---
const hostSees = await host.from('cards').select('id, body, author_member_id').eq('stage_id', stage.id)
if ((hostSees.data ?? []).length !== 3) fail(`host should see 3, saw ${hostSees.data?.length}`)
else ok('host sees all 3 for grouping')

// --- THE anonymity guarantee: no author recorded on an anon stage ---
const authored = (hostSees.data ?? []).filter((c) => c.author_member_id !== null)
if (authored.length) fail(`ANON BREACH: ${authored.length} cards carry an author`)
else ok('no card carries an author on an anonymous stage')

// --- reveal, then passengers can read + vote ---
await host.from('stages').update({ state: 'revealed' }).eq('id', stage.id)
const seen = await pax[0].from('cards').select('id').eq('stage_id', stage.id)
if ((seen.data ?? []).length !== 3) fail(`after reveal expected 3, got ${seen.data?.length}`)
else ok('cards visible after reveal')

// dot budget is 2 -> third vote must be refused
const target = seen.data[0].id
const v1 = await pax[0].rpc('cast_dot', { p_card_id: target })
const v2 = await pax[0].rpc('cast_dot', { p_card_id: seen.data[1].id })
const v3 = await pax[0].rpc('cast_dot', { p_card_id: seen.data[2].id })
if (v1.error || v2.error) fail('first two dots should succeed')
else if (!v3.error) fail('third dot must be refused (budget 2)')
else ok('dot budget enforced (2 allowed, 3rd refused)')

// --- votes must carry no voter ---
const { data: voteRows } = await host.from('votes').select('*').eq('stage_id', stage.id)
const voteCols = Object.keys(voteRows?.[0] ?? {})
if (voteCols.some((c) => /member|user|author|voter/i.test(c))) fail(`vote row leaks voter: ${voteCols}`)
else ok(`votes carry no voter (${voteCols.join(', ')})`)

// --- submitting to a closed stage must fail ---
await host.from('stages').update({ state: 'closed' }).eq('id', stage.id)
const late = await pax[1].rpc('submit_card', { p_stage_id: stage.id, p_body: 'geç kaldım', p_max: 20 })
if (!late.error) fail('submission to a closed stage must be refused')
else ok('closed stage refuses submissions')

// --- passenger cannot promote a card to an action (host only) ---
const sneaky = await pax[2].from('actions')
  .insert({ meeting_id: meeting.id, body: 'yetkisiz karar' })
if (!sneaky.error) fail('passenger must not create actions')
else ok('actions are host-only')

// --- host promotes, everyone can read it ---
const { error: promErr } = await host.from('actions')
  .insert({ meeting_id: meeting.id, source_card_id: target, body: 'CI kuyruğunu düzelt' })
if (promErr) fail(`host promote: ${promErr.message}`)
const paxSees = await pax[0].from('actions').select('body').eq('meeting_id', meeting.id)
if ((paxSees.data ?? []).length !== 1) fail('passengers should see the action')
else ok('host-created action visible to everyone')

// --- cleanup ---
await host.from('meetings').delete().eq('id', meeting.id)
for (const n of names) await host.from('members').delete().eq('display_name', n)
console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED')
process.exit(process.exitCode ?? 0)
