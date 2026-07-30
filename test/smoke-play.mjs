// SMOKE TEST: play every game to a real conclusion through the UI, with four
// browsers, and report weaknesses rather than just pass/fail.
//
// Distinct from e2e-play.mjs, which proves each screen renders and one action
// works. This one plays games THROUGH — Codenames to a winner, Wavelength through
// clue/dial/bet/reveal, Fibbage through lie/guess/score — and probes the awkward
// moments: joining mid-game, empty input, very long text, two people racing the
// same control, the host advancing while someone is typing.
//
// Run: node test/smoke-play.mjs
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { hostClient, client, claim } from './_clients.mjs'

const PORT = 4240
const APP = `http://localhost:${PORT}/retrobus/`
const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'
const SHOTS = process.env.SHOT_DIR ?? null

const problems = []
const notes = []
const bad = (area, msg) => { problems.push(`[${area}] ${msg}`); console.log(`  ✗ ${area}: ${msg}`) }
const good = (msg) => console.log(`  ✓ ${msg}`)
const note = (msg) => { notes.push(msg); console.log(`  · ${msg}`) }

// ---------- fixture ----------
const api = await hostClient()
const NAMES = ['Smoke1', 'Smoke2', 'Smoke3']
const CODES = ['811111', '822222', '833333']
await api.from('meetings').delete().eq('title', 'Smoke')
for (const n of NAMES) {
  await api.from('members').delete().eq('display_name', n)
  await api.from('members').insert({ display_name: n })
}
const { data: roster } = await api.from('members').select('id, display_name')
const idOf = (n) => roster.find((r) => r.display_name === n)?.id
for (let i = 0; i < NAMES.length; i++) {
  await api.rpc('set_member_code', { p_member_id: idOf(NAMES[i]), p_code: CODES[i] })
}
const { data: meeting } = await api.from('meetings')
  .insert({ title: 'Smoke', status: 'live' }).select().single()

let order = 0
const addStage = async (kind, title, config = {}) =>
  (await api.from('stages')
    .insert({ meeting_id: meeting.id, kind, title, order_index: ++order, config })
    .select().single()).data
const activate = async (st) => {
  await api.from('meetings').update({ active_stage_id: st.id }).eq('id', meeting.id)
  await api.from('stages').update({ state: 'open' }).eq('id', st.id)
}

// ---------- browsers ----------
const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()
const jsErrors = []

async function login(name, code) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'tr-TR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => jsErrors.push(`${name}: ${e.message.slice(0, 120)}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text())) {
      jsErrors.push(`${name}: ${m.text().slice(0, 120)}`)
    }
  })
  // a bare "400" tells us nothing; record the endpoint and the reason
  page.on('response', async (res) => {
    if (res.status() < 400) return
    let why = ''
    try { why = (await res.text()).slice(0, 160) } catch { /* body already gone */ }
    const path = res.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    jsErrors.push(`${name}: ${res.status()} ${path} ${why}`)
  })
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('örn. Enes').fill(name)
  const boxes = page.locator('input[inputmode="numeric"]')
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i])
  await page.waitForTimeout(4000)
  const skip = page.getByRole('button', { name: 'Şimdilik geç' })
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(1500) }
  const go = page.getByRole('button', { name: 'Hadi başlayalım' })
  if (await go.count()) { await go.click(); await page.waitForTimeout(500) }
  return page
}
const room = async (pg) => {
  await pg.goto(APP + '#/oda', { waitUntil: 'networkidle' })
  await pg.reload({ waitUntil: 'networkidle' })
  await pg.waitForTimeout(2200)
}
const shot = async (pg, n) => { if (SHOTS) await pg.screenshot({ path: `${SHOTS}/smoke-${n}.png` }) }

const host = await login('Enes', HOST_CODE)
const p1 = await login(NAMES[0], CODES[0])
const p2 = await login(NAMES[1], CODES[1])
const p3 = await login(NAMES[2], CODES[2])
good('4 players joined')

// =====================================================================
console.log('\n=== CODENAMES: play to a winner ===')
{
  const st = await addStage('codenames', 'Ajanlar')
  await activate(st)
  await room(host)
  const mk = host.getByRole('button', { name: /Yeni oyun kur/ })
  if (await mk.count()) { await mk.click(); await host.waitForTimeout(2000) }

  const seat = async (pg, team, spy) => {
    await room(pg)
    const card = pg.locator('section.card', { hasText: team === 'red' ? 'Kırmızı' : 'Mavi' }).first()
    const b = card.getByRole('button', { name: spy ? /Spymaster/ : /Operatör/ })
    if (!(await b.count())) { bad('codenames', `${team} ${spy ? 'spymaster' : 'operatör'} button missing`); return }
    await b.first().click()
    await pg.waitForTimeout(1000)
  }
  await seat(p1, 'red', true)
  await seat(p2, 'red', false)
  await seat(p3, 'blue', true)
  await seat(host, 'blue', false)

  await room(host)
  const deal = host.getByRole('button', { name: /Tahtayı dağıt/ })
  if (!(await deal.count())) { bad('codenames', 'deal button never appeared with 2 spymasters') }
  else { await deal.click(); await host.waitForTimeout(2500) }

  let g = (await api.from('cn_games').select('*').eq('stage_id', st.id).single()).data
  if (g?.phase !== 'playing') bad('codenames', `did not start (phase=${g?.phase})`)
  else good('game started')

  const spyOf = (t) => (t === 'red' ? p1 : p3)
  const opOf = (t) => (t === 'red' ? p2 : host)
  const keys = (await p1.evaluate(() => null), (await api.from('cn_keys').select('card_id, role').eq('game_id', g.id)).data)
  const cards = (await api.from('cn_cards').select('id, word, revealed').eq('game_id', g.id)).data
  const roleOf = (id) => keys.find((k) => k.card_id === id)?.role

  // play up to 12 turns, always guessing a correct card for whoever is on turn
  let turns = 0
  let winner = null
  while (turns++ < 14) {
    g = (await api.from('cn_games').select('*').eq('id', g.id).single()).data
    if (g.phase === 'done') { winner = g.winner; break }
    const spy = spyOf(g.turn)
    const op = opOf(g.turn)
    if (!g.clue_word) {
      await room(spy)
      const box = spy.getByPlaceholder('Tek kelime ipucu')
      if (!(await box.count())) { bad('codenames', `spymaster of ${g.turn} has no clue box on their turn`); break }
      await box.fill(`ipucu${turns}`)
      await spy.getByRole('button', { name: /^Ver$/ }).click()
      await spy.waitForTimeout(1500)
      g = (await api.from('cn_games').select('*').eq('id', g.id).single()).data
      if (!g.clue_word) { bad('codenames', 'clue did not register'); break }
    }
    // pick one of this team's own unrevealed cards
    const fresh = (await api.from('cn_cards').select('id, revealed').eq('game_id', g.id)).data
    const mine = fresh.find((c) => !c.revealed && roleOf(c.id) === g.turn)
    if (!mine) { note('codenames: no own cards left to guess'); break }
    await room(op)
    const tile = op.locator(`.grid button`).nth(cards.findIndex((c) => c.id === mine.id))
    if (!(await tile.count())) { bad('codenames', 'tile not clickable for the operative on turn'); break }
    await tile.click()
    await op.waitForTimeout(1600)
  }
  g = (await api.from('cn_games').select('*').eq('id', g.id).single()).data
  if (g.phase === 'done') {
    good(`played to a winner: ${g.winner} (${g.win_reason}) in ${turns} turns`)
    await room(host)
    await shot(host, 'cn-done')
    const award = host.getByRole('button', { name: /puan ver/ })
    if (!(await award.count())) bad('codenames', 'no award button after the game ended')
    else {
      await award.click(); await host.waitForTimeout(1800)
      const { data: sc } = await api.from('scores').select('member_id').eq('stage_id', st.id)
      if (!(sc ?? []).length) bad('codenames', 'award produced no scores')
      else good(`winning team scored (${sc.length} players)`)
    }
  } else {
    note(`codenames did not finish in ${turns} turns (phase=${g.phase}) — not necessarily a bug`)
  }
}

// =====================================================================
console.log('\n=== WAVELENGTH: clue → dial → bet → reveal ===')
{
  const st = await addStage('wavelength', 'Frekans')
  await activate(st)
  await room(host)
  const auto = host.getByRole('button', { name: /Takımları otomatik kur/ })
  if (!(await auto.count())) bad('wavelength', 'no auto-team button')
  else { await auto.click(); await host.waitForTimeout(2000) }

  const teams = (await api.from('stages').select('config').eq('id', st.id).single()).data.config.teams ?? {}
  // the psychic must be someone we are actually driving a browser for, or the
  // test blames the app for a clue nobody was in a position to give
  const driven = new Set([idOf('Enes'), ...NAMES.map(idOf)].filter(Boolean))
  const teamA = Object.entries(teams).filter(([id, t]) => t === 'a' && driven.has(id)).map(([id]) => id)
  const teamB = Object.entries(teams).filter(([id, t]) => t === 'b' && driven.has(id)).map(([id]) => id)
  if (!teamA.length || !teamB.length) bad('wavelength', `unbalanced teams a=${teamA.length} b=${teamB.length}`)

  // host starts a round with a psychic from team A
  await room(host)
  const sel = host.locator('select').last()
  const psychicId = teamA[0]
  await sel.selectOption(psychicId)
  await host.waitForTimeout(400)
  const start = host.getByRole('button', { name: 'Yeni tur' })
  if (!(await start.count())) bad('wavelength', 'no start-round button')
  else { await start.click(); await host.waitForTimeout(2200) }

  const round = (await api.from('wave_rounds').select('*').eq('stage_id', st.id).order('order_index')).data.at(-1)
  if (!round) { bad('wavelength', 'round did not start') }
  else {
    const pageFor = (id) => ({ [idOf(NAMES[0])]: p1, [idOf(NAMES[1])]: p2, [idOf(NAMES[2])]: p3 })[id] ?? host
    const psychic = pageFor(round.psychic_member_id)
    await room(psychic)
    const clueBox = psychic.getByPlaceholder(/İpucun/)
    if (!(await clueBox.count())) bad('wavelength', 'psychic has no clue input')
    else {
      await clueBox.fill('buzdolabı')
      await psychic.getByRole('button', { name: /^Ver$/ }).click()
      await psychic.waitForTimeout(1600)
      good('psychic gave the clue')
    }
    // active-team members dial
    const activeIds = Object.entries(teams)
      .filter(([id, t]) => t === round.active_team && id !== round.psychic_member_id && driven.has(id))
      .map(([id]) => id)
    let dialled = 0
    for (const id of activeIds) {
      const pg = pageFor(id)
      await room(pg)
      const slider = pg.locator('input[type="range"]')
      if (!(await slider.count())) { note(`wavelength: ${roster.find(r=>r.id===id)?.display_name} had no dial`); continue }
      await slider.fill('55')
      const send = pg.getByRole('button', { name: /olarak gönder/ })
      if (await send.count()) { await send.click(); await pg.waitForTimeout(1200); dialled++ }
    }
    if (!dialled) bad('wavelength', 'nobody on the active team could set a dial')
    else good(`${dialled} active-team dial(s) submitted`)

    await room(host)
    const lock = host.getByRole('button', { name: /Kadranı kilitle/ })
    if (!(await lock.count())) bad('wavelength', 'host cannot lock the dial')
    else { await lock.click(); await host.waitForTimeout(1800) }

    const r2 = (await api.from('wave_rounds').select('*').eq('id', round.id).single()).data
    if (r2.phase !== 'bet') bad('wavelength', `expected bet phase, got ${r2.phase}`)
    else good(`dial locked at ${r2.team_dial}, betting open`)

    // opposing team bets
    const betIds = Object.entries(teams).filter(([id, t]) => t !== round.active_team && driven.has(id)).map(([id]) => id)
    let betters = 0
    for (const id of betIds) {
      const pg = pageFor(id)
      await room(pg)
      const left = pg.getByRole('button', { name: /Solunda/ })
      if (await left.count()) { await left.click(); await pg.waitForTimeout(1100); betters++ }
    }
    if (!betters) bad('wavelength', 'opposing team could not bet')
    else good(`${betters} bet(s) placed`)

    await room(host)
    const rev = host.getByRole('button', { name: /Hedefi aç/ })
    if (!(await rev.count())) bad('wavelength', 'host cannot reveal')
    else { await rev.click(); await host.waitForTimeout(2200) }
    const { data: ws } = await api.from('scores').select('member_id, points, reason').eq('stage_id', st.id)
    if (!(ws ?? []).length) note('wavelength: no scores — possible if the dial missed every band')
    else good(`scored: ${ws.map((s) => s.reason).join(', ')}`)
    await shot(host, 'wave-revealed')
  }
}

// =====================================================================
console.log('\n=== FIBBAGE: lie → guess → reveal ===')
{
  const st = await addStage('fibbage', 'Fibbage')
  await activate(st)
  await room(host)
  const det = host.getByText('Yeni tur ekle')
  if (await det.count()) { await det.first().click(); await host.waitForTimeout(500) }
  const prompt = host.getByPlaceholder(/Soru…/)
  if (!(await prompt.count())) bad('fibbage', 'host has no round composer')
  else {
    await prompt.first().fill('Enes ilk hangi işte çalıştı?')
    await host.getByPlaceholder('Gerçek cevap').fill('Çağrı merkezi')
    await host.getByRole('button', { name: 'Ekle ve başlat' }).click()
    await host.waitForTimeout(2000)
  }
  const round = (await api.from('fibbage_rounds').select('*').eq('stage_id', st.id).single()).data
  if (!round) { bad('fibbage', 'round not created') }
  else {
    for (const [pg, lie] of [[p1, 'Bakkal'], [p2, 'Garson'], [p3, 'Kurye']]) {
      await room(pg)
      const box = pg.getByPlaceholder(/İnandırıcı bir yalan/)
      if (!(await box.count())) {
        bad('fibbage', 'a PLAYER cannot see the lie input — the round is hidden from them')
        break
      }
      await box.fill(lie)
      await pg.getByRole('button', { name: /Gönder/ }).first().click()
      await pg.waitForTimeout(1100)
    }
    const lies = (await api.from('fibbage_lies').select('id').eq('round_id', round.id)).data
    if ((lies ?? []).length !== 3) bad('fibbage', `expected 3 lies, got ${lies?.length}`)
    else good('3 lies written')

    await room(host)
    const toGuess = host.getByRole('button', { name: /Tahmine geç/ })
    if (!(await toGuess.count())) bad('fibbage', 'host cannot advance to guessing')
    else { await toGuess.click(); await host.waitForTimeout(1800) }

    // everyone picks something
    let picks = 0
    for (const pg of [p1, p2, p3]) {
      await room(pg)
      const opts = pg.locator('section.card button').filter({ hasNotText: 'Şoför' })
      const n = await opts.count()
      if (!n) { bad('fibbage', 'no options to pick during guessing'); break }
      // click an option that is not our own lie (own lie is disabled)
      for (let i = 0; i < n; i++) {
        const o = opts.nth(i)
        if (await o.isEnabled()) { await o.click(); picks++; break }
      }
      await pg.waitForTimeout(1000)
    }
    good(`${picks} picks made`)

    await room(host)
    const revFib = host.getByRole('button', { name: /Gerçeği aç/ })
    if (!(await revFib.count())) bad('fibbage', 'host cannot reveal')
    else { await revFib.click(); await host.waitForTimeout(2000) }
    const { data: fs } = await api.from('scores').select('reason').eq('stage_id', st.id)
    if (!(fs ?? []).length) note('fibbage: no scores (possible if everyone picked their own team lie)')
    else good(`scored: ${[...new Set(fs.map((x) => x.reason))].join(', ')}`)
    await shot(host, 'fib-revealed')
  }
}

// =====================================================================
console.log('\n=== TWO TRUTHS: write → pick → guess → reveal ===')
{
  const st = await addStage('two_truths', 'İki Doğru Bir Yalan')
  await activate(st)
  for (const [pg, who] of [[p1, 'a'], [p2, 'b'], [p3, 'c']]) {
    await room(pg)
    const inputs = pg.locator('input.input-blob')
    if ((await inputs.count()) < 3) { bad('two_truths', 'authoring form missing'); break }
    for (let i = 0; i < 3; i++) await inputs.nth(i).fill(`${who} cümle ${i + 1}`)
    const lieBtn = pg.getByRole('button', { name: '2. cümle yalan' })
    if (await lieBtn.count()) await lieBtn.click()
    await pg.getByRole('button', { name: /^Gönder$/ }).click()
    await pg.waitForTimeout(1200)
  }
  const entries = (await api.from('two_truths_entries').select('id, member_id').eq('stage_id', st.id)).data
  if ((entries ?? []).length !== 3) bad('two_truths', `expected 3 entries, got ${entries?.length}`)
  else good('3 entries written')

  // host picks the first entry
  await room(host)
  const pickBtn = host.locator('section.card', { hasText: 'Şoför: kart seç' })
    .locator('button').filter({ hasText: NAMES[0] }).first()
  if (!(await pickBtn.count())) bad('two_truths', 'host cannot pick a card')
  else { await pickBtn.click(); await host.waitForTimeout(1800) }

  // the others guess
  let guesses = 0
  for (const pg of [p2, p3]) {
    await room(pg)
    const opts = pg.locator('section.card button').filter({ hasText: /cümle/ })
    if (await opts.count()) {
      const first = opts.first()
      if (await first.isEnabled()) { await first.click(); guesses++; await pg.waitForTimeout(1000) }
    }
  }
  if (!guesses) bad('two_truths', 'nobody could guess')
  else good(`${guesses} guesses`)

  await room(host)
  const revTT = host.getByRole('button', { name: /Yalanı aç/ })
  if (!(await revTT.count())) bad('two_truths', 'host cannot reveal the lie')
  else {
    await revTT.click(); await host.waitForTimeout(2000)
    const { data: ts } = await api.from('scores').select('reason').eq('stage_id', st.id)
    good(`revealed; scores: ${(ts ?? []).length}`)
  }
  await shot(host, 'tt-revealed')
}

// =====================================================================
console.log('\n=== EDGE CASES ===')
{
  // whitespace-only card
  const st = await addStage('board', 'Kenar Durumlar', { identity: 'anon', reveal: 'live', dots: 2 })
  await activate(st)
  await room(p1)
  const ta = p1.locator('textarea').first()
  await ta.fill('    ')
  const addBtn = p1.getByRole('button', { name: /^Ekle$/ }).first()
  if (await addBtn.isEnabled()) {
    await addBtn.click(); await p1.waitForTimeout(1200)
    const { data: c } = await api.from('cards').select('id, body').eq('stage_id', st.id)
    if ((c ?? []).length) bad('board', 'accepted a whitespace-only card')
    else good('whitespace-only card refused')
  } else good('whitespace-only card: button correctly disabled')

  // very long text
  await ta.fill('X'.repeat(600))
  const len = await ta.inputValue()
  if (len.length > 500) bad('board', `textarea allowed ${len.length} chars past the 500 limit`)
  else good(`long text clamped to ${len.length} chars`)
  await ta.fill('normal kart')
  await p1.getByRole('button', { name: /^Ekle$/ }).first().click()
  await p1.waitForTimeout(1200)

  // a player joining mid-meeting sees the current stage
  const late = await login(NAMES[2], CODES[2])
  await room(late)
  const title = await late.locator('.stage-title, h2').first().textContent().catch(() => '')
  if (!title?.includes('Kenar')) bad('join', `late joiner did not land on the active stage (saw "${title?.trim().slice(0, 30)}")`)
  else good('late joiner lands on the current stage')

  // two people racing the same vote
  await api.from('stages').update({ state: 'revealed' }).eq('id', st.id)
  await room(p1); await room(p2)
  const v1 = p1.locator('button', { hasText: '🔵' }).first()
  const v2 = p2.locator('button', { hasText: '🔵' }).first()
  if ((await v1.count()) && (await v2.count())) {
    await Promise.all([v1.click(), v2.click()])
    await p1.waitForTimeout(2000)
    const { data: votes } = await api.from('votes').select('id').eq('stage_id', st.id)
    if ((votes ?? []).length !== 2) bad('board', `simultaneous votes produced ${votes?.length}, expected 2`)
    else good('two simultaneous votes both landed')
  }

  // host advances while someone is typing
  const st2 = await addStage('board', 'Sonraki Durak', { identity: 'anon', reveal: 'live' })
  await room(p1)
  const ta2 = p1.locator('textarea').first()
  if (await ta2.count()) await ta2.fill('yazarken durak değişti')
  await activate(st2)
  await p1.waitForTimeout(6000)
  const nowTitle = await p1.locator('.stage-title, h2').first().textContent().catch(() => '')
  if (!nowTitle?.includes('Sonraki')) bad('stage-change', `player did not follow the host (saw "${nowTitle?.trim().slice(0, 30)}")`)
  else good('player followed the host mid-typing (their draft is lost, which is expected)')
}

// ---------- report ----------
console.log('\n================ SMOKE REPORT ================')
if (jsErrors.length) {
  const uniq = [...new Set(jsErrors)]
  bad('js', `${uniq.length} distinct browser error(s): ${uniq.slice(0, 4).join(' | ')}`)
} else good('no browser errors in any of the four sessions')

console.log(`\nproblems: ${problems.length}`)
problems.forEach((p) => console.log('  ' + p))
if (notes.length) {
  console.log(`\nnotes: ${notes.length}`)
  notes.forEach((n) => console.log('  ' + n))
}

await api.from('meetings').delete().eq('id', meeting.id)
for (const n of NAMES) await api.from('members').delete().eq('display_name', n)
await browser.close()
await server.close()
process.exit(problems.length ? 1 : 0)
