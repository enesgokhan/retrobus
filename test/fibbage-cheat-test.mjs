// Can a determined passenger find the truth before the reveal?
//
// An adversarial review found two ways through the "opaque options" scheme, and
// neither needed anything more than the browser console:
//
//   1. fib_options returned each lie under its real primary key while the truth
//      got a token, and fibbage_lies was readable — so the option id absent from
//      that table was the truth. One set subtraction.
//   2. pick_fib_option stored the verdict in a row the picker could read back,
//      and it upserted — so you could try every option and read the boolean each
//      time. In the UI it was even simpler: picking a lie highlighted the card,
//      picking the truth highlighted nothing.
//
// This suite performs both attacks and requires them to fail. It is written to
// be nasty on purpose: this is the flagship game and the whole point of it is
// that nobody knows.
import { hostClient, client, claim } from './_clients.mjs'

let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const api = await hostClient()
const CAST = [
  { name: 'Hile1', code: '551111' },
  { name: 'Hile2', code: '552222' },
  { name: 'Hile3', code: '553333' },
]
await api.from('meetings').delete().eq('title', 'HileTesti')
for (const c of CAST) {
  await api.from('members').delete().eq('display_name', c.name)
  await api.from('members').insert({ display_name: c.name })
}
const { data: roster } = await api.from('members').select('id, display_name')
const idOf = (n) => roster.find((r) => r.display_name === n)?.id
for (const c of CAST) await api.rpc('set_member_code', { p_member_id: idOf(c.name), p_code: c.code })

await api.from('meetings').update({ status: 'done', active_stage_id: null }).eq('status', 'live')
const { data: meeting } = await api.from('meetings')
  .insert({ title: 'HileTesti', status: 'live' }).select().single()
const { data: stage } = await api.from('stages').insert({
  meeting_id: meeting.id, kind: 'fibbage', title: 'İnandırıcı Yalan', order_index: 1, config: {},
}).select().single()

const TRUTH = 'İkinci el bir gitar'
const { data: roundId } = await api.rpc('create_fibbage_round', {
  p_stage_id: stage.id, p_prompt: 'Enes ilk maaşıyla ne aldı?', p_truth: TRUTH, p_multiplier: 1,
})

// three passengers, three lies
const pax = []
for (let i = 0; i < CAST.length; i++) {
  const c = await client(`p${i + 1}`)
  await claim(c, CAST[i].name, CAST[i].code)
  pax.push(c)
  const { error } = await c.rpc('submit_fib_lie', { p_round_id: roundId, p_body: `${CAST[i].name} uydurdu` })
  if (error) fail(`${CAST[i].name} could not write a lie: ${error.message}`)
}
await api.from('fibbage_rounds').update({ phase: 'guess' }).eq('id', roundId)
console.log('\n-- tahmin aşaması: bir yolcu gerçeği bulabilir mi --')

// ---------------------------------------------------------------- attack 1
{
  const { data: opts, error: oe } = await pax[0].rpc('fib_options', { p_round_id: roundId })
  if (oe || !(opts ?? []).length) fail(`a passenger cannot see the options at all: ${oe?.message}`)
  else ok(`the passenger sees ${opts.length} options`)

  const truthRow = (opts ?? []).find((o) => o.body === TRUTH)
  if (!truthRow) fail('the truth is not among the options — the game is unwinnable')
  else if (truthRow.is_truth !== null) {
    fail(`fib_options marks the truth during the guess phase (is_truth=${truthRow.is_truth})`)
  } else ok('no option is marked as the truth during the guess')

  // the original attack: subtract the readable lies from the option list
  const { data: lies, error: le } = await pax[0].from('fibbage_lies').select('id, body')
  if (!le && (lies ?? []).length) {
    fail(`a passenger can still read fibbage_lies (${lies.length} rows) — set subtraction names the truth`)
  } else ok('fibbage_lies is not readable by passengers')

  // scoped to THIS round: keys of already-revealed rounds are readable by
  // design, so an unscoped select fails for the right reason on a reused project
  const { data: keys } = await pax[0].from('fibbage_keys').select('truth').eq('round_id', roundId)
  if ((keys ?? []).length) fail('a passenger can read this round\'s key before the reveal')
  else ok('fibbage_keys is not readable for a round in play')

  // and the tokens must not be the lie ids under another name
  const ids = new Set((lies ?? []).map((l) => l.id))
  const overlap = (opts ?? []).filter((o) => ids.has(o.opt_id)).length
  if (overlap) fail(`${overlap} option ids are real lie primary keys`)

  // position must not be the answer either: `union all` appended the truth last
  // every time, so the raw response ended with it
  const truthIdx = (opts ?? []).findIndex((o) => o.body === TRUTH)
  if (truthIdx === (opts ?? []).length - 1) {
    // one round could be coincidence; check a few fresh rounds
    let lastCount = 0
    for (let i = 0; i < 5; i++) {
      const { data: rid } = await api.rpc('create_fibbage_round', {
        p_stage_id: stage.id, p_prompt: `soru ${i}`, p_truth: `gerçek ${i}`, p_multiplier: 1,
      })
      await pax[0].rpc('submit_fib_lie', { p_round_id: rid, p_body: `yalan a${i}` })
      await pax[1].rpc('submit_fib_lie', { p_round_id: rid, p_body: `yalan b${i}` })
      await api.from('fibbage_rounds').update({ phase: 'guess' }).eq('id', rid)
      const { data: o2 } = await pax[2].rpc('fib_options', { p_round_id: rid })
      const idx = (o2 ?? []).findIndex((x) => x.body === `gerçek ${i}`)
      if (idx === (o2 ?? []).length - 1) lastCount++
    }
    if (lastCount >= 5) fail('the truth is always the last option — position gives it away')
    else ok('the truth does not sit in a fixed position')
  } else ok('the truth is not in a fixed position')
}

// ---------------------------------------------------------------- attack 2
{
  const { data: opts } = await pax[0].rpc('fib_options', { p_round_id: roundId })
  const mine = (opts ?? []).filter((o) => !o.is_mine)
  // walk every option, reading back whatever the pick tells us
  let learned = 0
  for (const o of mine) {
    const { error } = await pax[0].rpc('pick_fib_option', { p_round_id: roundId, p_opt_id: o.opt_id })
    const { data: picks } = await pax[0].from('fibbage_picks').select('picked_truth, lie_id')
    if ((picks ?? []).length) {
      const row = picks[0]
      if (row.picked_truth === true || row.picked_truth === false) learned++
    }
    if (error && !/already picked/.test(error.message)) {
      // an error that varies by whether we hit the truth would also be a tell
      if (!/unknown option|own lie/.test(error.message)) {
        fail(`picking produced a revealing error: ${error.message}`)
      }
    }
  }
  if (learned) fail(`the picker can read back whether their guess was the truth (${learned} times)`)
  else ok('the picker is never told whether they found it')

  const { data: after } = await pax[0].from('fibbage_picks').select('picked_truth')
  if ((after ?? []).length) fail('fibbage_picks is readable by passengers')
  else ok('fibbage_picks is not readable by passengers')

  // and one pick means one pick
  const { data: rows } = await api.from('fibbage_picks').select('id').eq('round_id', roundId)
  if ((rows ?? []).length > 1) fail(`one passenger recorded ${rows.length} picks in a single round`)
  else ok('a passenger gets exactly one pick per round')

  // the state function must not leak it either
  const { data: st } = await pax[0].rpc('fib_state', { p_round_id: roundId })
  const blob = JSON.stringify(st ?? {})
  if (/picked_truth|is_truth|true/.test(blob) && !/"phase"/.test(blob)) {
    fail(`fib_state leaks a verdict: ${blob.slice(0, 120)}`)
  }
  if (st?.takers && Object.keys(st.takers).length) {
    fail('fib_state reveals who picked what before the reveal')
  } else ok('fib_state keeps the picks to itself until the reveal')
}

// ---------------------------------------------------------------- reveal
console.log('\n-- açılıştan sonra her şey görünür olmalı --')
{
  const rev = await api.rpc('reveal_fib', { p_round_id: roundId })
  if (rev.error) fail(`reveal failed: ${rev.error.message}`)
  const { data: opts } = await pax[1].rpc('fib_options', { p_round_id: roundId })
  const truthRow = (opts ?? []).find((o) => o.is_truth === true)
  if (!truthRow) fail('after the reveal nobody can tell which was the truth')
  else if (truthRow.body !== TRUTH) fail(`the wrong option is marked true: ${truthRow.body}`)
  else ok('after the reveal the truth is marked, and it is the right one')
  const authored = (opts ?? []).filter((o) => o.author).length
  if (authored < 3) fail(`only ${authored} options carry an author after the reveal`)
  else ok('authorship appears at the reveal')
  const { data: st } = await pax[1].rpc('fib_state', { p_round_id: roundId })
  if (!st?.takers || !Object.keys(st.takers).length) fail('nobody can see who picked what after the reveal')
  else ok('who picked what is visible after the reveal')
}

await api.from('meetings').delete().eq('id', meeting.id)
for (const c of CAST) await api.from('members').delete().eq('display_name', c.name)
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
