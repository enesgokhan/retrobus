// Asserts the games follow their PUBLISHED rules, not my memory of them.
// Each check names the rule it enforces.
import { hostClient, client, claim } from './_clients.mjs'

let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const host = await hostClient()
const names = ['Test1', 'Test2', 'Test3', 'Test4']
const codes = ['111111', '222222', '333333', '444444']
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
const { data: meeting } = await host.from('meetings')
  .insert({ title: 'Kural Testleri', status: 'live' }).select().single()
const mkStage = async (kind, config = {}) => {
  const { data } = await host.from('stages')
    .insert({ meeting_id: meeting.id, kind, title: kind, order_index: 1, config })
    .select().single()
  await host.from('stages').update({ state: 'open' }).eq('id', data.id)
  return data
}

// ============ CODENAMES: official rulebook ============
console.log('\n-- codenames: resmi kurallar --')
const cnStage = await mkStage('codenames')
const { data: game } = await host.from('cn_games').insert({ stage_id: cnStage.id }).select().single()
const words = ['ELMA', 'ARMUT', 'KEDI', 'KOPEK', 'MASA', ...Array.from({ length: 20 }, (_, i) => `KEL${i}`)]
await c.Test1.rpc('cn_join', { p_game_id: game.id, p_team: 'red', p_spymaster: true })
await c.Test2.rpc('cn_join', { p_game_id: game.id, p_team: 'red', p_spymaster: false })
await c.Test3.rpc('cn_join', { p_game_id: game.id, p_team: 'blue', p_spymaster: true })
await c.Test4.rpc('cn_join', { p_game_id: game.id, p_team: 'blue', p_spymaster: false })
await host.rpc('cn_deal', { p_game_id: game.id, p_words: words })

const { data: g0 } = await host.from('cn_games').select('turn').eq('id', game.id).single()
const spy = g0.turn === 'red' ? c.Test1 : c.Test3
const op = g0.turn === 'red' ? c.Test2 : c.Test4
const { data: keysAll } = await spy.from('cn_keys').select('card_id, role').eq('game_id', game.id)
const { data: cards } = await host.from('cn_cards').select('id, word, position').eq('game_id', game.id)
const roleOf = (id) => keysAll.find((k) => k.card_id === id)?.role

// RULE: the clue cannot be a codename visible on the board
const onBoard = cards[0].word
const boardClue = await spy.rpc('cn_clue', { p_game_id: game.id, p_word: onBoard, p_count: 1 })
if (!boardClue.error) fail(`clue "${onBoard}" is on the board and must be refused`)
else ok('RULE: clue may not be a word visible on the board')

// case-insensitively too
const lowerClue = await spy.rpc('cn_clue', { p_game_id: game.id, p_word: onBoard.toLowerCase(), p_count: 1 })
if (!lowerClue.error) fail('board-word check must be case-insensitive')
else ok('board-word check is case-insensitive')

// RULE: a clue is a single word
const twoWords = await spy.rpc('cn_clue', { p_game_id: game.id, p_word: 'iki kelime', p_count: 1 })
if (!twoWords.error) fail('multi-word clue must be refused')
else ok('RULE: clue must be a single word')

const good = await spy.rpc('cn_clue', { p_game_id: game.id, p_word: 'MEYVE', p_count: 2 })
if (good.error) fail(`valid clue rejected: ${good.error.message}`)
else ok('valid clue accepted')

// RULE: count + 1 guesses
const { data: g1 } = await host.from('cn_games').select('guesses_left').eq('id', game.id).single()
if (g1.guesses_left !== 3) fail(`count 2 should allow 3 guesses, got ${g1.guesses_left}`)
else ok('RULE: guesses = count + 1')

// RULE: must make at least one guess before passing
const earlyPass = await op.rpc('cn_pass', { p_game_id: game.id })
if (!earlyPass.error) fail('passing before any guess must be refused')
else ok('RULE: operatives must guess at least once before passing')

// guess own colour, then passing IS allowed
const ownCard = cards.find((x) => roleOf(x.id) === g0.turn)
await op.rpc('cn_guess', { p_card_id: ownCard.id })
const laterPass = await op.rpc('cn_pass', { p_game_id: game.id })
if (laterPass.error) fail(`passing after a guess should be allowed: ${laterPass.error.message}`)
else ok('RULE: may pass after the first guess')

// RULE: 0 / unlimited means guess until wrong
const { data: g2 } = await host.from('cn_games').select('turn').eq('id', game.id).single()
const spy2 = g2.turn === 'red' ? c.Test1 : c.Test3
await spy2.rpc('cn_clue', { p_game_id: game.id, p_word: 'SINIRSIZ', p_count: 0 })
const { data: g3 } = await host.from('cn_games').select('guesses_left, clue_count').eq('id', game.id).single()
if (g3.guesses_left < 90) fail(`count 0 should mean unlimited, got ${g3.guesses_left}`)
else ok('RULE: count 0 / unlimited = guess until wrong')

// ============ FIBBAGE: Jackbox rules ============
console.log('\n-- fibbage: jackbox kuralları --')
const fibStage = await mkStage('fibbage')
const { data: round } = await host.from('fibbage_rounds')
  .insert({ stage_id: fibStage.id, prompt: 'Test?', truth: 'GERÇEK', multiplier: 2 })
  .select().single()

await c.Test1.rpc('submit_fib_lie', { p_round_id: round.id, p_body: 'aynı yalan' })
// RULE: no duplicate lies
const dupe = await c.Test2.rpc('submit_fib_lie', { p_round_id: round.id, p_body: 'aynı yalan' })
if (!dupe.error) fail('a duplicate lie must be refused')
else ok('RULE: duplicate lies refused')
const dupeCase = await c.Test2.rpc('submit_fib_lie', { p_round_id: round.id, p_body: 'AYNI YALAN' })
if (!dupeCase.error) fail('duplicate check must be case-insensitive')
else ok('duplicate check is case-insensitive')
// but you may edit your OWN lie to the same text
const ownAgain = await c.Test1.rpc('submit_fib_lie', { p_round_id: round.id, p_body: 'aynı yalan' })
if (ownAgain.error) fail('resubmitting your own identical lie should be allowed')
else ok('you may resubmit your own lie')

await c.Test2.rpc('submit_fib_lie', { p_round_id: round.id, p_body: 'başka yalan' })
await c.Test3.rpc('submit_fib_lie', { p_round_id: round.id, p_body: 'üçüncü yalan' })
await host.from('fibbage_rounds').update({ phase: 'guess' }).eq('id', round.id)

const t1Lie = (await c.Test1.rpc('fib_authorship', { p_round_id: round.id })).data[0].lie_id
await c.Test2.rpc('pick_fib', { p_round_id: round.id, p_lie_id: null, p_truth: true })  // finds truth
await c.Test3.rpc('pick_fib', { p_round_id: round.id, p_lie_id: t1Lie, p_truth: false }) // fooled by T1

const revFib = await host.rpc('reveal_fib', { p_round_id: round.id })
if (revFib.error) fail(`reveal_fib: ${revFib.error.message}`)
else if (revFib.data.multiplier != 2) fail(`multiplier not applied: ${JSON.stringify(revFib.data)}`)
else ok('RULE: round multiplier reported')

const { data: fs } = await host.from('scores').select('member_id, points, reason').eq('stage_id', fibStage.id)
const fp = (n, r) => (fs ?? []).filter((s) => s.member_id === idOf(n) && s.reason === r)
  .reduce((a, b) => a + b.points, 0)
if (fp('Test2', 'fib_found_truth') !== 2000) fail(`truth at x2 should be 2000, got ${fp('Test2', 'fib_found_truth')}`)
else ok('RULE: 1000 for the truth, doubled in round 2 = 2000')
if (fp('Test1', 'fib_fooled') !== 1000) fail(`fooling 1 at x2 should be 1000, got ${fp('Test1', 'fib_fooled')}`)
else ok('RULE: 500 per person fooled, doubled = 1000')

// ============ WAVELENGTH: real two-team game ============
console.log('\n-- wavelength: gerçek iki takımlı oyun --')
const teams = {
  [idOf('Test1')]: 'a', [idOf('Test2')]: 'a',
  [idOf('Test3')]: 'b', [idOf('Test4')]: 'b',
}
const wStage = await mkStage('wavelength', { teams })
const wr = await host.rpc('start_wave_round', {
  p_stage_id: wStage.id, p_left: 'soğuk', p_right: 'sıcak', p_psychic: idOf('Test1'),
})
if (wr.error) { fail(`start_wave_round: ${wr.error.message}`); }
const rid = wr.data
const { data: wRound } = await host.from('wave_rounds').select('active_team, phase').eq('id', rid).single()
if (wRound.active_team !== 'a') fail(`active team should follow the psychic, got ${wRound.active_team}`)
else ok("active team derives from the psychic's team")

const tgt = (await c.Test1.from('wave_targets').select('target').eq('round_id', rid).single()).data.target
await c.Test1.rpc('give_wave_clue', { p_round_id: rid, p_clue: 'buzdolabı' })

// RULE: only the ACTIVE team sets the dial
const wrongTeamDial = await c.Test3.rpc('guess_wave', { p_round_id: rid, p_value: 50 })
if (!wrongTeamDial.error) fail('the opposing team must not set the dial')
else ok('RULE: only the active team sets the dial')

// active team dials; team dial is the median
await c.Test2.rpc('guess_wave', { p_round_id: rid, p_value: Math.max(0, tgt - 4) })
const closed = await host.rpc('close_wave_dial', { p_round_id: rid })
if (closed.error) fail(`close_wave_dial: ${closed.error.message}`)
else ok(`team dial fixed at the median (${closed.data.team_dial}, target ${tgt})`)

// RULE: only the OPPOSING team bets
const activeBet = await c.Test2.rpc('bet_wave', { p_round_id: rid, p_side: 'left' })
if (!activeBet.error) fail('the active team must not bet')
else ok('RULE: only the opposing team bets')

const dial = closed.data.team_dial
const correctSide = tgt < dial ? 'left' : 'right'
await c.Test3.rpc('bet_wave', { p_round_id: rid, p_side: correctSide })
await c.Test4.rpc('bet_wave', { p_round_id: rid, p_side: correctSide === 'left' ? 'right' : 'left' })

const revW = await host.rpc('reveal_wave', { p_round_id: rid })
if (revW.error) { fail(`reveal_wave: ${revW.error.message}`) }
else {
  if (revW.data.band !== 4) fail(`dial within 4 of target should be band 4, got ${revW.data.band}`)
  else ok(`RULE: band scoring 4/3/2 by distance (band ${revW.data.band} = ${revW.data.points} puan)`)
  if (revW.data.bets_correct !== 1) fail(`expected 1 correct bet, got ${revW.data.bets_correct}`)
  else ok('RULE: opposing team scores on a correct left/right call')
}

const { data: ws } = await host.from('scores').select('member_id, points, reason').eq('stage_id', wStage.id)
const wp = (n, r) => (ws ?? []).filter((s) => s.member_id === idOf(n) && s.reason === r)
  .reduce((a, b) => a + b.points, 0)
if (wp('Test1', 'wave_team') <= 0) fail('the psychic shares the team result')
else ok('psychic scores with their team')
if (wp('Test2', 'wave_team') <= 0) fail('active team members should score')
else ok('active team scores the band')
if (wp('Test3', 'wave_bet') !== 250) fail(`correct better should get 250, got ${wp('Test3', 'wave_bet')}`)
else ok('correct better scores 250')
if (wp('Test4', 'wave_bet') !== 0) fail(`wrong better should get 0, got ${wp('Test4', 'wave_bet')}`)
else ok('wrong better scores nothing')
// the defining property: BOTH teams had a chance to score
const teamAPts = wp('Test1', 'wave_team') + wp('Test2', 'wave_team')
const teamBPts = wp('Test3', 'wave_bet') + wp('Test4', 'wave_bet')
if (teamAPts > 0 && teamBPts > 0) ok('RULE: both teams score from one clue')
else fail(`both teams should be able to score: A=${teamAPts} B=${teamBPts}`)

// ============ RANK THESE: scored like Herd Mentality ============
console.log('\n-- sırala bakalım: sürüyle uyum puanı --')
const rStage = await mkStage('rank')
const itemIds = []
for (const [i, label] of ['Pizza', 'Burger', 'Lahmacun', 'Döner'].entries()) {
  const { data } = await host.from('rank_items')
    .insert({ stage_id: rStage.id, label, order_index: i }).select().single()
  itemIds.push(data.id)
}
// three agree, one is contrarian
await c.Test1.rpc('submit_ranking', { p_stage_id: rStage.id, p_ordering: itemIds })
await c.Test2.rpc('submit_ranking', { p_stage_id: rStage.id, p_ordering: itemIds })
await c.Test3.rpc('submit_ranking', { p_stage_id: rStage.id, p_ordering: itemIds })
await c.Test4.rpc('submit_ranking', { p_stage_id: rStage.id, p_ordering: [...itemIds].reverse() })

const revR = await host.rpc('reveal_ranking', { p_stage_id: rStage.id })
if (revR.error) fail(`reveal_ranking: ${revR.error.message}`)
else if (revR.data.scored !== 4) fail(`expected 4 scored, got ${revR.data.scored}`)
else ok(`scored ${revR.data.scored} rankings`)

const { data: rs } = await host.from('scores').select('member_id, points').eq('stage_id', rStage.id)
const rp = (n) => (rs ?? []).filter((s) => s.member_id === idOf(n)).reduce((a, b) => a + b.points, 0)
if (rp('Test1') <= rp('Test4')) fail(`herd should beat contrarian: T1=${rp('Test1')} T4=${rp('Test4')}`)
else ok(`RULE: agreeing with the herd scores more (${rp('Test1')} vs ${rp('Test4')})`)
if (rp('Test4') < 100) fail('even a contrarian keeps the floor of 100')
else ok('contrarian still scores the floor')

// re-reveal must not double-score
await host.rpc('reveal_ranking', { p_stage_id: rStage.id })
const { data: rs2 } = await host.from('scores').select('id').eq('stage_id', rStage.id)
if ((rs2 ?? []).length !== (rs ?? []).length) fail('re-reveal double-scored')
else ok('reveal_ranking is idempotent')

await host.from('meetings').delete().eq('id', meeting.id)
for (const n of names) await host.from('members').delete().eq('display_name', n)
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
