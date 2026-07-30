// Phase 3 end-to-end: two truths (dual scoring), health check, feedback wall.
// Runs 4 concurrent clients against the real project.
import { createClient } from '@supabase/supabase-js'

const URL = 'https://mxskxexxyazddcdusnvz.supabase.co'
const KEY = 'sb_publishable_EdAjymtekBQR6Hg6vtjpPg_1Gd6E4Ge'
const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'
const mk = () => createClient(URL, KEY, { auth: { persistSession: false } })

let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const host = mk()
await host.auth.signInAnonymously()
const hc = await host.rpc('claim_member', { p_name: 'Enes', p_code: HOST_CODE })
if (!hc.data?.ok) { console.error('host claim failed — set RETROBUS_HOST_CODE'); process.exit(1) }

const names = ['Ayse', 'Baris', 'Ceyda']
const codes = ['111111', '222222', '333333']
for (const n of names) await host.from('members').insert({ display_name: n })
const { data: roster } = await host.from('members').select('id, display_name')
const idOf = (n) => roster.find((r) => r.display_name === n).id
for (let i = 0; i < names.length; i++) {
  await host.rpc('set_member_code', { p_member_id: idOf(names[i]), p_code: codes[i] })
}
const pax = []
for (let i = 0; i < names.length; i++) {
  const c = mk()
  await c.auth.signInAnonymously()
  const r = await c.rpc('claim_member', { p_name: names[i], p_code: codes[i] })
  if (!r.data?.ok) { fail(`login ${names[i]}`); process.exit(1) }
  pax.push(c)
}
const { data: meeting } = await host.from('meetings')
  .insert({ title: 'Faz3 Testi', status: 'live' }).select().single()
const mkStage = async (kind, config = {}) => {
  const { data } = await host.from('stages')
    .insert({ meeting_id: meeting.id, kind, title: kind, order_index: 1, config })
    .select().single()
  await host.from('stages').update({ state: 'open' }).eq('id', data.id)
  return data.id
}

// ============ TWO TRUTHS ============
console.log('\n-- iki doğru bir yalan --')
const ttStage = await mkStage('two_truths')
for (let i = 0; i < pax.length; i++) {
  const { error } = await pax[i].rpc('submit_two_truths', {
    p_stage_id: ttStage, p_s1: `a${i}`, p_s2: `b${i}`, p_s3: `c${i}`, p_lie_index: 2,
  })
  if (error) fail(`submit ${names[i]}: ${error.message}`)
}
ok('3 entries submitted')

const { data: entries } = await pax[0].from('two_truths_entries').select('id, member_id').eq('stage_id', ttStage)
if (entries?.length !== 3) fail(`expected 3 entries, got ${entries?.length}`)

// THE key property: nobody can read someone else's lie before reveal
const target = entries.find((e) => e.member_id !== idOf('Ayse'))
const peek = await pax[0].from('two_truths_keys').select('lie_index').eq('entry_id', target.id)
if ((peek.data ?? []).length !== 0) fail(`LIE LEAKED before reveal: ${JSON.stringify(peek.data)}`)
else ok('lie hidden from other players before reveal')

// but you can read your OWN
const ownEntry = entries.find((e) => e.member_id === idOf('Ayse'))
const own = await pax[0].from('two_truths_keys').select('lie_index').eq('entry_id', ownEntry.id)
if ((own.data ?? []).length !== 1) fail('author cannot read their own lie')
else ok('author can read their own lie')

// even the host cannot peek before reveal
const hostPeek = await host.from('two_truths_keys').select('lie_index').eq('entry_id', target.id)
if ((hostPeek.data ?? []).length !== 0) fail('host peeked at an unrevealed lie')
else ok('host cannot peek at an unrevealed lie')

// self-guess refused
const selfGuess = await pax[0].rpc('guess_two_truths', { p_entry_id: ownEntry.id, p_guess_index: 1 })
if (!selfGuess.error) fail('self-guess must be refused')
else ok('self-guess refused')

// Baris + Ceyda guess Ayse's entry: one right (2), one wrong
await pax[1].rpc('guess_two_truths', { p_entry_id: ownEntry.id, p_guess_index: 2 }) // correct
await pax[2].rpc('guess_two_truths', { p_entry_id: ownEntry.id, p_guess_index: 1 }) // wrong
ok('2 guesses recorded')

// non-host cannot reveal
const sneakyReveal = await pax[1].rpc('reveal_two_truths', { p_entry_id: ownEntry.id })
if (!sneakyReveal.error) fail('non-host must not reveal')
else ok('reveal is host-only')

const rev = await host.rpc('reveal_two_truths', { p_entry_id: ownEntry.id })
if (rev.error) fail(`reveal: ${rev.error.message}`)
else if (rev.data.lie_index !== 2 || rev.data.correct !== 1 || rev.data.fooled !== 1)
  fail(`reveal tally wrong: ${JSON.stringify(rev.data)}`)
else ok(`revealed: lie=2, correct=1, fooled=1`)

// scoring: Baris +2 correct, Ayse +1 fooled
const { data: sc } = await host.from('scores').select('member_id, points, reason').eq('stage_id', ttStage)
const pts = (n) => (sc ?? []).filter((s) => s.member_id === idOf(n)).reduce((a, b) => a + b.points, 0)
if (pts('Baris') !== 2) fail(`Baris should have 2, has ${pts('Baris')}`)
else if (pts('Ayse') !== 1) fail(`Ayse should have 1 (fooled Ceyda), has ${pts('Ayse')}`)
else if (pts('Ceyda') !== 0) fail(`Ceyda should have 0, has ${pts('Ceyda')}`)
else ok('scores: correct guess +2, author +1 per person fooled')

// lie readable now
const afterPeek = await pax[2].from('two_truths_keys').select('lie_index').eq('entry_id', ownEntry.id)
if ((afterPeek.data ?? []).length !== 1) fail('lie should be readable after reveal')
else ok('lie readable after reveal')

// ============ HEALTH CHECK ============
console.log('\n-- takım nabzı --')
const hStage = await mkStage('health_check')
for (const c of pax) {
  await c.rpc('submit_health', { p_stage_id: hStage, p_dimension_key: 'fun', p_rating: 3 })
}
const dupe = await pax[0].rpc('submit_health', { p_stage_id: hStage, p_dimension_key: 'fun', p_rating: 1 })
if (!dupe.error) fail('second rating for same dimension must be refused')
else ok('one rating per person per dimension')

const badRating = await pax[0].rpc('submit_health', { p_stage_id: hStage, p_dimension_key: 'speed', p_rating: 9 })
if (!badRating.error) fail('rating 9 must be refused')
else ok('rating range enforced')

const earlyRead = await pax[0].from('health_responses').select('rating').eq('stage_id', hStage)
if ((earlyRead.data ?? []).length !== 0) fail('health results leaked before reveal')
else ok('health results hidden until reveal')

await host.from('stages').update({ state: 'revealed' }).eq('id', hStage)
const lateRead = await pax[0].from('health_responses').select('rating, dimension_key').eq('stage_id', hStage)
if ((lateRead.data ?? []).length !== 3) fail(`expected 3 ratings, got ${lateRead.data?.length}`)
else ok('health results visible after reveal')

const hCols = Object.keys(lateRead.data[0] ?? {})
const { data: rawHealth } = await host.from('health_responses').select('*').eq('stage_id', hStage)
const hAll = Object.keys(rawHealth?.[0] ?? {})
if (hAll.some((c) => /member|user|author/i.test(c))) fail(`health row leaks rater: ${hAll}`)
else ok(`health rows carry no rater (${hAll.join(', ')})`)

// ============ FEEDBACK WALL ============
console.log('\n-- geri bildirim duvarı --')
const fStage = await mkStage('feedback_wall')
const selfFb = await pax[0].rpc('submit_feedback', {
  p_stage_id: fStage, p_target_member_id: idOf('Ayse'), p_kind: 'strength', p_body: 'kendim',
})
if (!selfFb.error) fail('feedback about yourself must be refused')
else ok('cannot write feedback about yourself')

for (let i = 0; i < 2; i++) {
  const { error } = await pax[0].rpc('submit_feedback', {
    p_stage_id: fStage, p_target_member_id: idOf('Baris'), p_kind: 'strength', p_body: `iyi ${i}`,
  })
  if (error) fail(`feedback ${i}: ${error.message}`)
}
const third = await pax[0].rpc('submit_feedback', {
  p_stage_id: fStage, p_target_member_id: idOf('Baris'), p_kind: 'strength', p_body: 'üçüncü',
})
if (!third.error) fail('third strength for same target must be refused (cap 2)')
else ok('per-target per-kind cap of 2 enforced')

// different kind for same target still allowed
const growth = await pax[0].rpc('submit_feedback', {
  p_stage_id: fStage, p_target_member_id: idOf('Baris'), p_kind: 'growth', p_body: 'şunu geliştir',
})
if (growth.error) fail('growth for same target should be allowed')
else ok('separate cap per kind')

// hidden from EVERYONE incl. host while collecting
const paxEarly = await pax[1].from('feedback_items').select('body').eq('stage_id', fStage)
const hostEarly = await host.from('feedback_items').select('body').eq('stage_id', fStage)
if ((paxEarly.data ?? []).length !== 0) fail('feedback leaked to passengers before reveal')
else if ((hostEarly.data ?? []).length !== 0) fail('feedback leaked to HOST before reveal')
else ok('feedback hidden from everyone, host included, while collecting')

await host.from('stages').update({ state: 'revealed' }).eq('id', fStage)
const afterReveal = await pax[1].from('feedback_items').select('body, kind, target_member_id').eq('stage_id', fStage)
if ((afterReveal.data ?? []).length !== 3) fail(`expected 3 items, got ${afterReveal.data?.length}`)
else ok('feedback visible to all after reveal')

const { data: rawFb } = await host.from('feedback_items').select('*').eq('stage_id', fStage)
const fbCols = Object.keys(rawFb?.[0] ?? {})
if (fbCols.some((c) => /author|writer|from_member|sender/i.test(c))) fail(`feedback leaks author: ${fbCols}`)
else ok(`feedback rows carry no author (${fbCols.join(', ')})`)

// passenger cannot hide a card
const sneakyHide = await pax[2].from('feedback_items').update({ hidden: true }).eq('id', rawFb[0].id)
const { data: checkHidden } = await host.from('feedback_items').select('hidden').eq('id', rawFb[0].id).single()
if (checkHidden.hidden === true) fail('passenger managed to hide a card')
else ok('only host can hide cards')

// ============ own code change ============
console.log('\n-- kendi kodunu değiştirme --')
const wrongCur = await pax[0].rpc('change_my_code', { p_current: '000000', p_new: '555555' })
if (wrongCur.data?.ok) fail('wrong current code must be refused')
else ok('code change requires the current code')
const goodCur = await pax[0].rpc('change_my_code', { p_current: '111111', p_new: '555555' })
if (!goodCur.data?.ok) fail(`code change failed: ${JSON.stringify(goodCur.data)}`)
else ok('code change works with correct current code')
const relog = mk()
await relog.auth.signInAnonymously()
const r2 = await relog.rpc('claim_member', { p_name: 'Ayse', p_code: '555555' })
if (!r2.data?.ok) fail('cannot log in with the new code')
else ok('new code works on next login')

// ============ cleanup ============
await host.from('meetings').delete().eq('id', meeting.id)
for (const n of names) await host.from('members').delete().eq('display_name', n)
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
