// Phase 4 end-to-end: quiz scoring, Fibbage, Rank These, leaderboard.
import { hostClient, client, claim } from './_clients.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
const pax = []
for (let i = 0; i < names.length; i++) {
  const c = await client(`member${i + 1}`)
  await claim(c, names[i], codes[i])
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
const { data: roundId } = await host.rpc('create_fibbage_round', {
  p_stage_id: fStage, p_prompt: 'Enes’in en sevdiği film?', p_truth: 'Kurtlar Vadisi',
})
const round = { id: roundId }

// This assertion used to say the opposite — that the whole round row must be
// invisible during the lie phase — and it passed, because that is exactly what
// the policy did. It was pinning the bug: hiding the row hides the PROMPT, so
// no passenger could see what they were lying about and the game was
// unplayable by anyone but the host. Two things must now be true at once.
const roundPeek = await pax[0].from('fibbage_rounds').select('id, prompt').eq('id', round.id)
if ((roundPeek.data ?? []).length !== 1) fail('players cannot see the round — Fibbage is unplayable')
else ok('players can read the prompt during the lie phase')

const truthPeek = await pax[0].from('fibbage_keys').select('truth').eq('round_id', round.id)
if ((truthPeek.data ?? []).length !== 0) fail('TRUTH LEAKED during lie phase')
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
// CONTRACT CHANGE (0011): resubmitting now UPDATES your ranking instead of
// being refused — you are ordering a list, so changing your mind before the
// reveal is correct. Still exactly one row per person.
const twice = await pax[0].rpc('submit_ranking', { p_stage_id: rStage, p_ordering: [...itemIds].reverse() })
if (twice.error) fail(`resubmitting should update, not fail: ${twice.error.message}`)
const { data: mineRows } = await pax[0].from('rank_submissions').select('id').eq('stage_id', rStage)
if ((mineRows ?? []).length !== 1) fail(`expected exactly 1 row per person, got ${mineRows?.length}`)
else ok('resubmitting updates in place (one row per person)')

// You may read your OWN ranking before reveal (the UI shows "kayıtlı"), but
// nobody else's.
const rEarly = await pax[0].from('rank_submissions').select('ordering, member_id').eq('stage_id', rStage)
const notMine = (rEarly.data ?? []).filter((r) => r.member_id !== idOf('Ayse'))
if (notMine.length) fail(`other people's rankings visible before reveal: ${notMine.length}`)
else if ((rEarly.data ?? []).length !== 1) fail(`should see exactly your own, saw ${rEarly.data?.length}`)
else ok('before reveal you see only your own ranking')

await host.from('stages').update({ state: 'revealed' }).eq('id', rStage)
const rLate = await pax[0].from('rank_submissions').select('*').eq('stage_id', rStage)
if ((rLate.data ?? []).length !== 3) fail(`expected 3 rankings, got ${rLate.data?.length}`)
else ok('rankings visible after reveal')
// CONTRACT CHANGE (0011): Rank These is now a SCORED game (Herd Mentality
// family), and a scoreboard requires identity — so submissions are named on
// purpose. Rankings of fast food are not sensitive. Everything genuinely
// sensitive (cards, feedback, health, polls) stays authorless; asserted in the
// other suites.
if (!(rLate.data ?? []).every((r) => r.member_id)) fail('scored rankings must carry a member_id')
else ok('rankings are named by design (needed to score agreement)')

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
// ---------------------------------------------------------------------------
// A player must be able to READ every screen they are asked to act on.
//
// Fibbage failed this and nothing caught it: the round row was hidden during
// the lie phase to protect the truth inside it, which also hid the prompt, so
// passengers saw "Şoför turu hazırlıyor…" and never got an input box. The game
// was playable only by the host. Every other game keeps its secret in a
// separate keys table precisely so the visible row stays visible.
console.log('\n-- oynanabilirlik: oyuncu kendi ekranını okuyabiliyor mu --')
for (const [table, cols] of [
  ['fibbage_rounds', 'id, prompt, phase'],
  ['wave_rounds', 'id, phase, active_team'],
  ['quiz_questions', 'id, prompt, options'],
  ['two_truths_entries', 'id, s1'],
]) {
  const { error } = await pax[0].from(table).select(cols).limit(1)
  if (error) fail(`a player cannot read ${table}(${cols}): ${error.message}`)
  else ok(`player can read ${table}`)
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
