// Phase 5 end-to-end: Codenames key-card secrecy + game rules, Wavelength target secrecy.
//
// The single most important assertion in this project is here: an operative must
// not be able to read the key card. If that leaks, Codenames is pointless.
import { hostClient, client, claim } from './_clients.mjs'


let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const host = await hostClient()

// 4 players: red spymaster, red operative, blue spymaster, blue operative
const names = ['Ayse', 'Baris', 'Ceyda', 'Deniz']
const codes = ['111111', '222222', '333333', '444444']
for (const n of names) await host.from('members').insert({ display_name: n })
const { data: roster } = await host.from('members').select('id, display_name')
const idOf = (n) => roster.find((r) => r.display_name === n).id
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
  .insert({ title: 'Faz5 Testi', status: 'live' }).select().single()
const mkStage = async (kind) => {
  const { data } = await host.from('stages')
    .insert({ meeting_id: meeting.id, kind, title: kind, order_index: 1 }).select().single()
  await host.from('stages').update({ state: 'open' }).eq('id', data.id)
  return data.id
}

// ============ CODENAMES ============
console.log('\n-- kelime ajanları --')
const cnStage = await mkStage('codenames')
const { data: game } = await host.from('cn_games').insert({ stage_id: cnStage }).select().single()

// dealing without spymasters must fail
const words = Array.from({ length: 25 }, (_, i) => `kelime${i}`)
const noSm = await host.rpc('cn_deal', { p_game_id: game.id, p_words: words })
if (!noSm.error) fail('dealing without spymasters must be refused')
else ok('needs a spymaster on both teams before dealing')

await c.Ayse.rpc('cn_join', { p_game_id: game.id, p_team: 'red', p_spymaster: true })
await c.Baris.rpc('cn_join', { p_game_id: game.id, p_team: 'red', p_spymaster: false })
await c.Ceyda.rpc('cn_join', { p_game_id: game.id, p_team: 'blue', p_spymaster: true })
await c.Deniz.rpc('cn_join', { p_game_id: game.id, p_team: 'blue', p_spymaster: false })
ok('4 players seated')

// second spymaster on the same team refused
const dupSm = await c.Baris.rpc('cn_join', { p_game_id: game.id, p_team: 'red', p_spymaster: true })
if (!dupSm.error) fail('two spymasters on one team must be refused')
else ok('one spymaster per team')

// non-host cannot deal
const sneakyDeal = await c.Ayse.rpc('cn_deal', { p_game_id: game.id, p_words: words })
if (!sneakyDeal.error) fail('non-host must not deal')
else ok('dealing is host-only')

const dealt = await host.rpc('cn_deal', { p_game_id: game.id, p_words: words })
if (dealt.error) { fail(`deal: ${dealt.error.message}`); process.exit(1) }
ok('board dealt')

// Board integrity, checked through a SPYMASTER client: the host is not a
// spymaster in this game, so RLS correctly gives them nothing (asserted below).
const { data: allKeys } = await c.Ayse.from('cn_keys').select('role').eq('game_id', game.id)
const tally = (r) => (allKeys ?? []).filter((k) => k.role === r).length
if ((allKeys ?? []).length !== 25) fail(`expected 25 keys, got ${allKeys?.length}`)
else if (tally('assassin') !== 1) fail(`expected 1 assassin, got ${tally('assassin')}`)
else if (tally('neutral') !== 7) fail(`expected 7 neutral, got ${tally('neutral')}`)
else if (Math.max(tally('red'), tally('blue')) !== 9) fail(`starting team needs 9: red ${tally('red')} blue ${tally('blue')}`)
else if (Math.min(tally('red'), tally('blue')) !== 8) fail(`other team needs 8: red ${tally('red')} blue ${tally('blue')}`)
else ok(`key card: 9/8/7/1 (red ${tally('red')}, blue ${tally('blue')}, neutral 7, assassin 1)`)

const { data: cards } = await host.from('cn_cards').select('id, word, position').eq('game_id', game.id)
if ((cards ?? []).length !== 25) fail(`expected 25 cards, got ${cards?.length}`)
else if (new Set(cards.map((x) => x.position)).size !== 25) fail('positions not unique')
else ok('25 cards at unique positions')

// ***** THE CRITICAL ASSERTION *****
const spyKeys = await c.Ayse.from('cn_keys').select('card_id, role').eq('game_id', game.id)
if ((spyKeys.data ?? []).length !== 25) fail(`spymaster should see all 25, saw ${spyKeys.data?.length}`)
else ok('spymaster sees the whole key card (25)')

const opKeys = await c.Baris.from('cn_keys').select('card_id, role').eq('game_id', game.id)
if ((opKeys.data ?? []).length !== 0) {
  fail(`*** KEY CARD LEAKED TO OPERATIVE: ${opKeys.data.length} rows ***`)
} else ok('*** operative sees ZERO key rows — the key card does not leak ***')

const oppKeys = await c.Ceyda.from('cn_keys').select('card_id, role').eq('game_id', game.id)
if ((oppKeys.data ?? []).length !== 25) fail('opposing spymaster should also see the key (they play too)')
else ok('opposing spymaster also sees the key')

// the host is a member but not a spymaster in this game
const outKeys = await host.from('cn_keys').select('role').eq('game_id', game.id)
if ((outKeys.data ?? []).length !== 0) fail(`non-player (host) saw ${outKeys.data.length} key rows`)
else ok('a member who is not a spymaster in this game sees zero key rows')

// ---- turn rules ----
const { data: g1 } = await host.from('cn_games').select('turn, starting_team').eq('id', game.id).single()
const first = g1.turn
const firstSpy = first === 'red' ? c.Ayse : c.Ceyda
const firstOp = first === 'red' ? c.Baris : c.Deniz
const otherOp = first === 'red' ? c.Deniz : c.Baris

// guessing before a clue must fail
const noClue = await firstOp.rpc('cn_guess', { p_card_id: cards[0].id })
if (!noClue.error) fail('guessing before a clue must be refused')
else ok('must wait for a clue')

// operative cannot give a clue
const opClue = await firstOp.rpc('cn_clue', { p_game_id: game.id, p_word: 'test', p_count: 1 })
if (!opClue.error) fail('operative must not give clues')
else ok('only spymasters give clues')

// wrong team's spymaster cannot clue
const wrongSpy = first === 'red' ? c.Ceyda : c.Ayse
const offTurn = await wrongSpy.rpc('cn_clue', { p_game_id: game.id, p_word: 'test', p_count: 1 })
if (!offTurn.error) fail('off-turn spymaster must not clue')
else ok('off-turn spymaster refused')

const gave = await firstSpy.rpc('cn_clue', { p_game_id: game.id, p_word: 'ipucu', p_count: 2 })
if (gave.error) fail(`clue: ${gave.error.message}`)
else ok('spymaster gave a clue (2 -> 3 guesses)')

// spymaster cannot guess
const spyGuess = await firstSpy.rpc('cn_guess', { p_card_id: cards[0].id })
if (!spyGuess.error) fail('spymaster must not guess')
else ok('spymasters do not guess')

// other team's operative cannot guess on this turn
const offTurnGuess = await otherOp.rpc('cn_guess', { p_card_id: cards[0].id })
if (!offTurnGuess.error) fail('off-turn operative must not guess')
else ok('off-turn operative refused')

// correct guess keeps the turn; wrong guess ends it
const keyMap = new Map((spyKeys.data ?? []).map((k) => [k.card_id, k.role]))
const ownCard = cards.find((x) => keyMap.get(x.id) === first)
const neutralCard = cards.find((x) => keyMap.get(x.id) === 'neutral')
const assassinCard = cards.find((x) => keyMap.get(x.id) === 'assassin')

const good = await firstOp.rpc('cn_guess', { p_card_id: ownCard.id })
if (good.error) fail(`own-team guess: ${good.error.message}`)
else if (good.data.role !== first) fail(`expected role ${first}, got ${good.data.role}`)
else ok('correct guess resolves and keeps the turn')

const { data: g2 } = await host.from('cn_games').select('turn, guesses_left').eq('id', game.id).single()
if (g2.turn !== first) fail('turn should not change after a correct guess')
else if (g2.guesses_left !== 2) fail(`expected 2 guesses left, got ${g2.guesses_left}`)
else ok('guess counter decremented (3 -> 2)')

const neutral = await firstOp.rpc('cn_guess', { p_card_id: neutralCard.id })
if (neutral.error) fail(`neutral guess: ${neutral.error.message}`)
else if (!neutral.data.turn_ended) fail('a neutral card must end the turn')
else ok('neutral card ends the turn')

const { data: g3 } = await host.from('cn_games').select('turn, clue_word').eq('id', game.id).single()
if (g3.turn === first) fail('turn should have passed')
else if (g3.clue_word !== null) fail('clue should be cleared on turn change')
else ok('turn passed and clue cleared')

// revealed cards become public knowledge
const opAfter = await c.Baris.from('cn_keys').select('card_id, role').eq('game_id', game.id)
if ((opAfter.data ?? []).length !== 2) fail(`operative should now see 2 flipped roles, saw ${opAfter.data?.length}`)
else ok('operative sees roles of flipped cards only (2)')

// assassin ends it
const secondTeam = g3.turn
const secondSpy = secondTeam === 'red' ? c.Ayse : c.Ceyda
const secondOp = secondTeam === 'red' ? c.Baris : c.Deniz
await secondSpy.rpc('cn_clue', { p_game_id: game.id, p_word: 'son', p_count: 1 })
const boom = await secondOp.rpc('cn_guess', { p_card_id: assassinCard.id })
if (boom.error) fail(`assassin guess: ${boom.error.message}`)
else if (!boom.data.ended) fail('assassin must end the game')
else if (boom.data.winner === secondTeam) fail('assassin must make the OTHER team win')
else ok(`assassin ends the game, ${boom.data.winner} wins`)

// whole key becomes visible once done
const doneKeys = await c.Baris.from('cn_keys').select('role').eq('game_id', game.id)
if ((doneKeys.data ?? []).length !== 25) fail(`after game over all 25 should show, got ${doneKeys.data?.length}`)
else ok('full key revealed once the game is over')

// award
const awarded = await host.rpc('cn_award', { p_game_id: game.id })
if (awarded.error) fail(`award: ${awarded.error.message}`)
const { data: cnScores } = await host.from('scores').select('member_id, points').eq('stage_id', cnStage)
if ((cnScores ?? []).length !== 2) fail(`winning team of 2 should get points, got ${cnScores?.length} rows`)
else ok('winning team awarded 1500 each')
const twice = await host.rpc('cn_award', { p_game_id: game.id })
if (!twice.data?.already) fail('double-award must be idempotent')
else ok('award is idempotent')

// ============ WAVELENGTH ============
console.log('\n-- frekans --')
const wStage = await mkStage('wavelength')
const rid = await host.rpc('start_wave_round', {
  p_stage_id: wStage, p_left: 'soğuk', p_right: 'sıcak', p_psychic: idOf('Ayse'),
})
if (rid.error) { fail(`start_wave_round: ${rid.error.message}`); process.exit(1) }
const roundId = rid.data
ok('round started, target generated server-side')

// only the psychic sees the target
const psyTarget = await c.Ayse.from('wave_targets').select('target').eq('round_id', roundId)
if ((psyTarget.data ?? []).length !== 1) fail('psychic must see the target')
else ok(`psychic sees the target (${psyTarget.data[0].target})`)

const guesserTarget = await c.Baris.from('wave_targets').select('target').eq('round_id', roundId)
if ((guesserTarget.data ?? []).length !== 0) fail('*** TARGET LEAKED to a guesser ***')
else ok('*** guesser sees ZERO target rows ***')

const hostTarget = await host.from('wave_targets').select('target').eq('round_id', roundId)
if ((hostTarget.data ?? []).length !== 0) fail('host peeked at the target')
else ok('even the host cannot see the target')

// only the psychic may clue
const notPsychic = await c.Baris.rpc('give_wave_clue', { p_round_id: roundId, p_clue: 'hile' })
if (!notPsychic.error) fail('non-psychic must not give the clue')
else ok('only the psychic gives the clue')

// guessing before the clue
const earlyGuess = await c.Baris.rpc('guess_wave', { p_round_id: roundId, p_value: 50 })
if (!earlyGuess.error) fail('guessing before the clue must be refused')
else ok('cannot guess before the clue')

await c.Ayse.rpc('give_wave_clue', { p_round_id: roundId, p_clue: 'buzdolabı' })
const target = psyTarget.data[0].target

// psychic cannot guess
const psyGuess = await c.Ayse.rpc('guess_wave', { p_round_id: roundId, p_value: target })
if (!psyGuess.error) fail('psychic must not guess')
else ok('psychic does not guess')

// out of range
const oor = await c.Baris.rpc('guess_wave', { p_round_id: roundId, p_value: 500 })
if (!oor.error) fail('value 500 must be refused')
else ok('guess range enforced (0..100)')

await c.Baris.rpc('guess_wave', { p_round_id: roundId, p_value: target })            // bullseye
await c.Ceyda.rpc('guess_wave', { p_round_id: roundId, p_value: Math.min(100, target + 10) })
await c.Deniz.rpc('guess_wave', { p_round_id: roundId, p_value: (target + 60) % 101 })

// guesses hidden until reveal
const peekGuesses = await c.Ceyda.from('wave_guesses').select('member_id, value').eq('round_id', roundId)
const notMine = (peekGuesses.data ?? []).filter((g) => g.member_id !== idOf('Ceyda'))
if (notMine.length) fail(`other guesses visible before reveal: ${notMine.length}`)
else ok('other players\' guesses hidden until reveal')

const revealed = await host.rpc('reveal_wave', { p_round_id: roundId })
if (revealed.error) fail(`reveal_wave: ${revealed.error.message}`)
else if (revealed.data.target !== target) fail('revealed target mismatch')
else ok(`revealed target ${revealed.data.target}, psychic earned ${revealed.data.psychic_points}`)

const { data: wScores } = await host.from('scores').select('member_id, points, reason').eq('stage_id', wStage)
const wp = (n, r) => (wScores ?? []).filter((s) => s.member_id === idOf(n) && s.reason === r)
  .reduce((a, b) => a + b.points, 0)
if (wp('Baris', 'wave_guess') !== 1000) fail(`bullseye should score 1000, got ${wp('Baris', 'wave_guess')}`)
else if (wp('Ceyda', 'wave_guess') !== 300) fail(`10 off should score 300, got ${wp('Ceyda', 'wave_guess')}`)
else if (wp('Ayse', 'wave_psychic') <= 0) fail('psychic should earn the room average')
else ok('wavelength scoring by distance + psychic average')

const afterTarget = await c.Baris.from('wave_targets').select('target').eq('round_id', roundId)
if ((afterTarget.data ?? []).length !== 1) fail('target should be public after reveal')
else ok('target public after reveal')

// ============ cleanup ============
await host.from('meetings').delete().eq('id', meeting.id)
for (const n of names) await host.from('members').delete().eq('display_name', n)
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
