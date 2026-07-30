// Phase 4 end-to-end: quiz scoring, Fibbage, Rank These, leaderboard.
import { createClient } from '@supabase/supabase-js'

const URL = 'https://mxskxexxyazddcdusnvz.supabase.co'
const KEY = 'sb_publishable_EdAjymtekBQR6Hg6vtjpPg_1Gd6E4Ge'
const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'
const mk = () => createClient(URL, KEY, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const host = mk()
await host.auth.signInAnonymously()
const hc = await host.rpc('claim_member', { p_name: 'Enes', p_code: HOST_CODE })
if (!hc.data?.ok) { console.error('host claim failed'); process.exit(1) }

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
  await c.rpc('claim_member', { p_name: names[i], p_code: codes[i] })
  pax.push(c)
}
const { data: meeting } = await host.from('meetings')
  .insert({ title: 'Faz4 Testi', status: 'live' }).select().single()
const mkStage = async (kind, config = {}) => {
  const { data } = await host.from('stages')
    .insert({ meeting_id: meeting.id, kind, title: kind, order_index: 1, config })
    .select().single()
  await host.from('stages').update({ state: 'open' }).eq('id', data.id)
  return data.id
}

// ============ QUIZ: choice ============
console.log('\n-- quiz: çoktan seçmeli --')
const qStage = await mkStage('quiz')
const { data: q1 } = await host.from('quiz_questions').insert({
  stage_id: qStage, meeting_id: meeting.id, kind: 'choice',
  prompt: 'Türkiye’nin başkenti?', options: ['İstanbul', 'Ankara', 'İzmir'],
  time_limit_s: 30, base_points: 1000,
}).select().single()
await host.from('quiz_keys').insert({ question_id: q1.id, correct_index: 1 })

// answering a draft question must fail
const early = await pax[0].rpc('answer_quiz', { p_question_id: q1.id, p_choice_index: 1 })
if (!early.error) fail('answering a draft question must be refused')
else ok('draft question refuses answers')

// passenger cannot open it
const sneakyOpen = await pax[0].rpc('open_quiz', { p_question_id: q1.id })
if (!sneakyOpen.error) fail('non-host must not open a question')
else ok('open_quiz is host-only')

// key must be hidden while not revealed
const keyPeek = await pax[0].from('quiz_keys').select('correct_index').eq('question_id', q1.id)
if ((keyPeek.data ?? []).length !== 0) fail('quiz answer leaked before reveal')
else ok('answer hidden before reveal')

await host.rpc('open_quiz', { p_question_id: q1.id })
// Ayse answers immediately (fast), Ceyda after a delay (slow), Baris wrong
await pax[0].rpc('answer_quiz', { p_question_id: q1.id, p_choice_index: 1 })
await pax[1].rpc('answer_quiz', { p_question_id: q1.id, p_choice_index: 0 })
await sleep(2500)
await pax[2].rpc('answer_quiz', { p_question_id: q1.id, p_choice_index: 1 })
ok('3 answers recorded')

// out of range refused
const oor = await pax[0].rpc('answer_quiz', { p_question_id: q1.id, p_choice_index: 99 })
if (!oor.error) fail('out-of-range choice must be refused')
else ok('choice range enforced')

// first answer is final
await pax[1].rpc('answer_quiz', { p_question_id: q1.id, p_choice_index: 1 })
const { data: barisAns } = await pax[1].from('quiz_answers')
  .select('choice_index').eq('question_id', q1.id).eq('member_id', idOf('Baris')).single()
if (barisAns.choice_index !== 0) fail('answer must be immutable once given')
else ok('first answer is final (no changing after the fact)')

const rq = await host.rpc('reveal_quiz', { p_question_id: q1.id })
if (rq.error) fail(`reveal_quiz: ${rq.error.message}`)
const { data: qScores } = await host.from('scores').select('member_id, points').eq('stage_id', qStage)
const pts = (n) => (qScores ?? []).filter((s) => s.member_id === idOf(n)).reduce((a, b) => a + b.points, 0)
if (pts('Baris') !== 0) fail(`Baris was wrong, should have 0, has ${pts('Baris')}`)
else if (pts('Ayse') <= 0 || pts('Ceyda') <= 0) fail('both correct answerers should score')
else if (pts('Ayse') <= pts('Ceyda')) fail(`faster should score more: Ayse ${pts('Ayse')} vs Ceyda ${pts('Ceyda')}`)
else ok(`speed weighting works (fast ${pts('Ayse')} > slow ${pts('Ceyda')}, wrong 0)`)

const keyAfter = await pax[0].from('quiz_keys').select('correct_index').eq('question_id', q1.id)
if ((keyAfter.data ?? []).length !== 1) fail('answer should be readable after reveal')
else ok('answer readable after reveal')

// ============ QUIZ: number ============
console.log('\n-- quiz: sayı tahmini --')
const { data: q2 } = await host.from('quiz_questions').insert({
  stage_id: qStage, meeting_id: meeting.id, kind: 'number',
  prompt: 'Kaç mesaj attık?', time_limit_s: 30, base_points: 1000,
}).select().single()
await host.from('quiz_keys').insert({ question_id: q2.id, correct_number: 100 })
await host.rpc('open_quiz', { p_question_id: q2.id })
await pax[0].rpc('answer_quiz', { p_question_id: q2.id, p_number: 98 })   // closest
await pax[1].rpc('answer_quiz', { p_question_id: q2.id, p_number: 130 })  // 2nd
await pax[2].rpc('answer_quiz', { p_question_id: q2.id, p_number: 500 })  // 3rd
await host.rpc('reveal_quiz', { p_question_id: q2.id })
const { data: nScores } = await host.from('scores').select('member_id, points, reason')
  .eq('stage_id', qStage).eq('reason', 'quiz_closest')
const npts = (n) => (nScores ?? []).filter((s) => s.member_id === idOf(n)).reduce((a, b) => a + b.points, 0)
if (npts('Ayse') !== 1000) fail(`closest should get 1000, got ${npts('Ayse')}`)
else if (npts('Baris') !== 600) fail(`2nd should get 600, got ${npts('Baris')}`)
else if (npts('Ceyda') !== 300) fail(`3rd should get 300, got ${npts('Ceyda')}`)
else ok('number question ranks by distance (1000/600/300)')

// ============ FIBBAGE ============
console.log('\n-- fibbage --')
const fStage = await mkStage('fibbage')
const { data: round } = await host.from('fibbage_rounds').insert({
  stage_id: fStage, prompt: 'Enes’in en sevdiği film?', truth: 'Kurtlar Vadisi',
}).select().single()

// the round row holds the truth, so it must be hidden during the lie phase
const roundPeek = await pax[0].from('fibbage_rounds').select('truth').eq('id', round.id)
if ((roundPeek.data ?? []).length !== 0) fail('TRUTH LEAKED during lie phase')
else ok('truth hidden during lie phase')

for (let i = 0; i < pax.length; i++) {
  const { error } = await pax[i].rpc('submit_fib_lie', { p_round_id: round.id, p_body: `yalan-${i}` })
  if (error) fail(`lie ${i}: ${error.message}`)
}
ok('3 lies submitted')

const truthAsLie = await pax[0].rpc('submit_fib_lie', { p_round_id: round.id, p_body: 'kurtlar vadisi' })
if (!truthAsLie.error) fail('submitting the truth as a lie must be refused')
else ok('cannot submit the truth as your lie')

await host.from('fibbage_rounds').update({ phase: 'guess' }).eq('id', round.id)
const { data: lies } = await pax[0].from('fibbage_lies').select('id, body').eq('round_id', round.id)
if ((lies ?? []).length !== 3) fail(`expected 3 lies visible, got ${lies?.length}`)
else ok('lies visible in guess phase')

// authorship must NOT be visible yet — neither by column nor by RPC
const colPeek = await pax[1].from('fibbage_lies').select('author_member_id').eq('round_id', round.id)
if (!colPeek.error) fail(`authorship column readable during guessing: ${JSON.stringify(colPeek.data)}`)
else ok('authorship column has no grant (42501)')

const rpcPeek = await pax[1].rpc('fib_authorship', { p_round_id: round.id })
const others = (rpcPeek.data ?? []).filter((r) => r.author_member_id !== idOf('Baris'))
if (others.length) fail(`fib_authorship leaked ${others.length} other authors during guessing`)
else if ((rpcPeek.data ?? []).length !== 1) fail('should see exactly your own authorship')
else ok('fib_authorship returns only your own lie before reveal')

// cannot pick your own lie
const ayseOwn = await pax[0].rpc('fib_authorship', { p_round_id: round.id })
const ayseLie = { id: ayseOwn.data[0].lie_id }
const ownPick = await pax[0].rpc('pick_fib', { p_round_id: round.id, p_lie_id: ayseLie.id, p_truth: false })
if (!ownPick.error) fail('picking your own lie must be refused')
else ok('cannot pick your own lie')

// Baris finds the truth; Ceyda falls for Ayse's lie
await pax[1].rpc('pick_fib', { p_round_id: round.id, p_lie_id: null, p_truth: true })
await pax[2].rpc('pick_fib', { p_round_id: round.id, p_lie_id: ayseLie.id, p_truth: false })

const rf = await host.rpc('reveal_fib', { p_round_id: round.id })
if (rf.error) fail(`reveal_fib: ${rf.error.message}`)
else if (rf.data.found_truth !== 1 || rf.data.fooled !== 1)
  fail(`fib tally wrong: ${JSON.stringify(rf.data)}`)
else ok('fibbage reveal tally correct')

const { data: fScores } = await host.from('scores').select('member_id, points, reason').eq('stage_id', fStage)
const fpts = (n, r) => (fScores ?? []).filter((s) => s.member_id === idOf(n) && s.reason === r)
  .reduce((a, b) => a + b.points, 0)
if (fpts('Baris', 'fib_found_truth') !== 1000) fail(`Baris should get 1000 for truth, got ${fpts('Baris', 'fib_found_truth')}`)
else if (fpts('Ayse', 'fib_fooled') !== 500) fail(`Ayse should get 500 for fooling 1, got ${fpts('Ayse', 'fib_fooled')}`)
else ok('fibbage scoring: +1000 truth, +500 per person fooled')

const allAuthors = await pax[1].rpc('fib_authorship', { p_round_id: round.id })
if ((allAuthors.data ?? []).length !== 3) fail(`after reveal expected 3 authors, got ${allAuthors.data?.length}`)
else ok('all authorship revealed after reveal')

// ============ RANK THESE ============
console.log('\n-- rank these --')
const rStage = await mkStage('rank')
const labels = ['Pizza', 'Burger', 'Lahmacun']
const itemIds = []
for (let i = 0; i < labels.length; i++) {
  const { data } = await host.from('rank_items')
    .insert({ stage_id: rStage, label: labels[i], order_index: i }).select().single()
  itemIds.push(data.id)
}
const shortOrder = await pax[0].rpc('submit_ranking', { p_stage_id: rStage, p_ordering: [itemIds[0]] })
if (!shortOrder.error) fail('incomplete ranking must be refused')
else ok('ranking must cover every item')

const dupeOrder = await pax[0].rpc('submit_ranking', {
  p_stage_id: rStage, p_ordering: [itemIds[0], itemIds[0], itemIds[1]],
})
if (!dupeOrder.error) fail('duplicate item must be refused')
else ok('duplicate items refused')

const alienOrder = await pax[0].rpc('submit_ranking', {
  p_stage_id: rStage, p_ordering: [itemIds[0], itemIds[1], meeting.id],
})
if (!alienOrder.error) fail('foreign item id must be refused')
else ok('foreign item ids refused')

for (const c of pax) {
  const { error } = await c.rpc('submit_ranking', { p_stage_id: rStage, p_ordering: itemIds })
  if (error) fail(`ranking: ${error.message}`)
}
const twice = await pax[0].rpc('submit_ranking', { p_stage_id: rStage, p_ordering: itemIds })
if (!twice.error) fail('second ranking from the same person must be refused')
else ok('one ranking per person')

const rEarly = await pax[0].from('rank_submissions').select('ordering').eq('stage_id', rStage)
if ((rEarly.data ?? []).length !== 0) fail('rankings leaked before reveal')
else ok('rankings hidden before reveal')

await host.from('stages').update({ state: 'revealed' }).eq('id', rStage)
const rLate = await pax[0].from('rank_submissions').select('*').eq('stage_id', rStage)
if ((rLate.data ?? []).length !== 3) fail(`expected 3 rankings, got ${rLate.data?.length}`)
else ok('rankings visible after reveal')
const rCols = Object.keys(rLate.data[0] ?? {})
if (rCols.some((c) => /member|user|author/i.test(c))) fail(`ranking leaks submitter: ${rCols}`)
else ok(`rankings carry no submitter (${rCols.join(', ')})`)

// ============ LEADERBOARD ============
console.log('\n-- şampiyonluk tablosu --')
const lb = await pax[0].rpc('leaderboard', { p_meeting_id: meeting.id })
if (lb.error) fail(`leaderboard: ${lb.error.message}`)
else {
  const rows = lb.data ?? []
  const sorted = rows.every((r, i) => i === 0 || rows[i - 1].points >= r.points)
  if (!sorted) fail('leaderboard not sorted by points desc')
  else if (rows.length < 3) fail(`expected at least 3 rows, got ${rows.length}`)
  else ok(`leaderboard sorted: ${rows.map((r) => `${r.display_name}=${r.points}`).join(', ')}`)
}

// clients must not be able to award themselves points
const cheat = await pax[0].from('scores')
  .insert({ meeting_id: meeting.id, member_id: idOf('Ayse'), points: 999999 })
if (!cheat.error) fail('CLIENT AWARDED ITSELF POINTS')
else ok('clients cannot insert scores')

// ============ cleanup ============
await host.from('meetings').delete().eq('id', meeting.id)
for (const n of names) await host.from('members').delete().eq('display_name', n)
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
