// Covers the fixes made in the post-feedback iteration:
//   * child queries scoped to the current stage (games not starved of data)
//   * stage_progress / active_member_count counts, and that they leak no identities
//   * readiness signals the host console relies on
import { hostClient, client, claim } from './_clients.mjs'

let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const host = await hostClient()
const names = ['Test1', 'Test2', 'Test3']
const codes = ['111111', '222222', '333333']
for (const n of names) await host.from('members').insert({ display_name: n })
const { data: roster } = await host.from('members').select('id, display_name')
const idOf = (n) => roster.find((r) => r.display_name === n)?.id
for (let i = 0; i < names.length; i++) {
  await host.rpc('set_member_code', { p_member_id: idOf(names[i]), p_code: codes[i] })
}
const c = {}
for (let i = 0; i < names.length; i++) {
  const cl = await client(`member${i + 1}`)
  await claim(cl, names[i], codes[i])
  c[names[i]] = cl
}

// ============ progress counts ============
console.log('\n-- ilerleme sayaçları --')
const { data: m1 } = await host.from('meetings')
  .insert({ title: 'Iterasyon A', status: 'live' }).select().single()
const { data: st } = await host.from('stages').insert({
  meeting_id: m1.id, kind: 'board', title: 'pano', order_index: 1,
  config: { identity: 'anon', reveal: 'batch', dots: 2 },
}).select().single()
await host.from('stages').update({ state: 'open' }).eq('id', st.id)

const total = await c.Test1.rpc('active_member_count')
if ((total.data ?? 0) < 3) fail(`active_member_count too low: ${total.data}`)
else ok(`active_member_count = ${total.data}`)

let p = await c.Test1.rpc('stage_progress', { p_stage_id: st.id, p_action_key: 'card' })
if (p.data !== 0) fail(`expected 0 writers, got ${p.data}`)
else ok('progress starts at 0')

await c.Test1.rpc('submit_card', { p_stage_id: st.id, p_body: 'a', p_max: 20 })
await c.Test2.rpc('submit_card', { p_stage_id: st.id, p_body: 'b', p_max: 20 })
// two cards from the same person must still count as ONE writer
await c.Test1.rpc('submit_card', { p_stage_id: st.id, p_body: 'a2', p_max: 20 })

p = await c.Test3.rpc('stage_progress', { p_stage_id: st.id, p_action_key: 'card' })
if (p.data !== 2) fail(`expected 2 distinct writers, got ${p.data}`)
else ok('counts DISTINCT people, not submissions')

// the count must not become a way to read the ledger
const ledger = await c.Test3.from('participation').select('member_id, action_key').eq('stage_id', st.id)
const others = (ledger.data ?? []).filter((r) => r.member_id !== idOf('Test3'))
if (others.length) fail(`participation leaked ${others.length} other people's rows`)
else ok('participation itself still private (count reveals no identities)')

// logged out must get nothing
const anonCount = await fetch(
  'https://mxskxexxyazddcdusnvz.supabase.co/rest/v1/rpc/active_member_count',
  {
    method: 'POST',
    headers: {
      apikey: 'sb_publishable_EdAjymtekBQR6Hg6vtjpPg_1Gd6E4Ge',
      'Content-Type': 'application/json',
    },
    body: '{}',
  },
).then((r) => r.status)
if (anonCount !== 403 && anonCount !== 401) fail(`logged-out call returned ${anonCount}, expected 401/403`)
else ok(`logged-out call refused (${anonCount})`)

// ============ scoped child queries ============
console.log('\n-- sorgular doğru duraga kapsanmış mı --')
// two quiz stages in the SAME meeting; each must only see its own questions
const { data: qa } = await host.from('stages')
  .insert({ meeting_id: m1.id, kind: 'quiz', title: 'quiz A', order_index: 2 }).select().single()
const { data: qb } = await host.from('stages')
  .insert({ meeting_id: m1.id, kind: 'quiz', title: 'quiz B', order_index: 3 }).select().single()

for (const [stage, label] of [[qa, 'A'], [qb, 'B']]) {
  for (let i = 0; i < 2; i++) {
    const { data: q } = await host.from('quiz_questions').insert({
      stage_id: stage.id, meeting_id: m1.id, kind: 'choice',
      prompt: `${label}${i}`, options: ['x', 'y'], time_limit_s: 30, base_points: 1000,
    }).select().single()
    await host.from('quiz_keys').insert({ question_id: q.id, correct_index: 0 })
  }
}

const { data: aQs } = await host.from('quiz_questions').select('id, prompt').eq('stage_id', qa.id)
const { data: bQs } = await host.from('quiz_questions').select('id, prompt').eq('stage_id', qb.id)
if ((aQs ?? []).length !== 2 || (bQs ?? []).length !== 2) {
  fail(`expected 2 questions per stage, got A=${aQs?.length} B=${bQs?.length}`)
} else if (aQs.some((q) => q.prompt.startsWith('B'))) {
  fail('stage A returned stage B questions')
} else {
  ok('quiz questions scoped per stage')
}

// keys/answers scoped by question id — the pattern the client now uses.
// While the questions are draft, the key is hidden from EVERYONE including the
// host: the host is on the leaderboard too, so letting them read answers early
// would let them win their own quiz.
const aIds = aQs.map((q) => q.id)
const { data: draftKeys } = await host.from('quiz_keys').select('question_id').in('question_id', aIds)
if ((draftKeys ?? []).length !== 0) {
  fail(`answers readable while draft (${draftKeys.length}) — host could win their own quiz`)
} else {
  ok('answers hidden while draft, host included')
}

await host.rpc('open_quiz', { p_question_id: aIds[0] })
await host.rpc('reveal_quiz', { p_question_id: aIds[0] })
const { data: revealedKeys } = await host.from('quiz_keys').select('question_id').in('question_id', aIds)
if ((revealedKeys ?? []).length !== 1) {
  fail(`after revealing one question expected 1 key, got ${revealedKeys?.length}`)
} else {
  ok('scoped key fetch returns exactly the revealed question')
}

// ============ readiness signals ============
console.log('\n-- kurulum göstergeleri --')
const { data: emptyQuiz } = await host.from('stages')
  .insert({ meeting_id: m1.id, kind: 'quiz', title: 'boş quiz', order_index: 4 }).select().single()
const { data: cnStage } = await host.from('stages')
  .insert({ meeting_id: m1.id, kind: 'codenames', title: 'ajanlar', order_index: 5 }).select().single()
const { data: rankStage } = await host.from('stages')
  .insert({ meeting_id: m1.id, kind: 'rank', title: 'sırala', order_index: 6 }).select().single()

const { data: eq } = await host.from('quiz_questions').select('stage_id').eq('stage_id', emptyQuiz.id)
if ((eq ?? []).length !== 0) fail('empty quiz should have no questions')
else ok('an unprepared quiz is detectable (0 questions)')

const { data: games } = await host.from('cn_games').select('stage_id').eq('stage_id', cnStage.id)
if ((games ?? []).length !== 0) fail('codenames stage should start with no game')
else ok('an unprepared codenames stage is detectable (no game)')

const { data: items } = await host.from('rank_items').select('stage_id').eq('stage_id', rankStage.id)
if ((items ?? []).length !== 0) fail('rank stage should start with no items')
else ok('an unprepared rank stage is detectable (0 items)')

// ============ wavelength requires an explicit psychic ============
console.log('\n-- frekans: ipucu veren açıkça seçilmeli --')
const { data: wStage } = await host.from('stages')
  .insert({ meeting_id: m1.id, kind: 'wavelength', title: 'frekans', order_index: 7 }).select().single()
const noPsychic = await host.rpc('start_wave_round', {
  p_stage_id: wStage.id, p_left: 'a', p_right: 'b', p_psychic: null,
})
if (!noPsychic.error) fail('starting a round with a null psychic must be refused')
else ok('server refuses a round with no psychic')

const withPsychic = await host.rpc('start_wave_round', {
  p_stage_id: wStage.id, p_left: 'soğuk', p_right: 'sıcak', p_psychic: idOf('Test1'),
})
if (withPsychic.error) fail(`valid round rejected: ${withPsychic.error.message}`)
else ok('round starts with an explicit psychic')

// guesses scoped to this stage's rounds
const { data: wRounds } = await host.from('wave_rounds').select('id').eq('stage_id', wStage.id)
const { data: wGuesses } = await host.from('wave_guesses').select('round_id')
  .in('round_id', wRounds.map((r) => r.id))
if (wGuesses === null) fail('scoped guess fetch errored')
else ok(`scoped guess fetch works (${wGuesses.length} rows)`)

await host.from('meetings').delete().eq('id', m1.id)
for (const n of names) await host.from('members').delete().eq('display_name', n)
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
