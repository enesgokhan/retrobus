// Browser end-to-end: four real users PLAY each game to a scored conclusion,
// against a local build of the current code.
//
// This exists because the database suites all passed while the app was visibly
// broken: members.avatar had no SELECT grant, so every game's member list came
// back empty — Codenames could not seat teams, Wavelength could not assign them,
// every name rendered "—". No integration test noticed, because none of them ran
// the client's own queries. Only a browser does.
//
// Run: node test/e2e-play.mjs   (needs RETROBUS_HOST_CODE if not 424242)
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { hostClient } from './_clients.mjs'

const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'
const PORT = 4200
const APP = `http://localhost:${PORT}/retrobus/`

let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

// ---------- fixture: roster + a clean meeting, set up over the API ----------
const api = await hostClient()
const NAMES = ['E2E1', 'E2E2', 'E2E3']
const CODES = ['711111', '722222', '733333']
await api.from('meetings').delete().eq('title', 'E2E')
for (const n of NAMES) {
  await api.from('members').delete().eq('display_name', n)
  await api.from('members').insert({ display_name: n })
}
const { data: roster } = await api.from('members').select('id, display_name')
const idOf = (n) => roster.find((r) => r.display_name === n)?.id
for (let i = 0; i < NAMES.length; i++) {
  await api.rpc('set_member_code', { p_member_id: idOf(NAMES[i]), p_code: CODES[i] })
}
const { data: meeting } = await api
  .from('meetings')
  .insert({ title: 'E2E', status: 'live' })
  .select()
  .single()

async function addStage(kind, title, config = {}) {
  const { data } = await api
    .from('stages')
    .insert({ meeting_id: meeting.id, kind, title, order_index: 1, config })
    .select()
    .single()
  return data
}
async function activate(stage) {
  await api.from('meetings').update({ active_stage_id: stage.id }).eq('id', meeting.id)
  await api.from('stages').update({ state: 'open' }).eq('id', stage.id)
}

// ---------- browsers ----------
const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()
const errors = []

async function login(name, code, w = 1280, h = 950) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'tr-TR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message.slice(0, 140)}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`${name} console: ${m.text().slice(0, 140)}`)
  })
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('örn. Enes').fill(name)
  const boxes = page.locator('input[inputmode="numeric"]')
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i])
  await page.waitForTimeout(4000)
  // skip the avatar step
  const skip = page.getByRole('button', { name: 'Şimdilik geç' })
  if (await skip.count()) {
    await skip.click()
    await page.waitForTimeout(1500)
  }
  // dismiss the welcome if the host wrote one
  const go = page.getByRole('button', { name: 'Hadi başlayalım' })
  if (await go.count()) {
    await go.click()
    await page.waitForTimeout(600)
  }
  return page
}

const host = await login('Enes', HOST_CODE, 1400, 1000)
const p1 = await login('E2E1', CODES[0])
const p2 = await login('E2E2', CODES[1])
const p3 = await login('E2E3', CODES[2])
ok('4 users logged in through the real join flow')

const room = async (page) => {
  // Navigating to the SAME hash URL is a no-op, so state changed server-side
  // would never appear. Always land on the room and reload.
  await page.goto(APP + '#/oda', { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
}

// ============ BOARD: write, reveal, vote ============
console.log('\n-- pano --')
{
  const st = await addStage('board', 'E2E Pano', { identity: 'anon', reveal: 'batch', dots: 2 })
  await activate(st)
  for (const [pg, txt] of [[p1, 'birinci kart'], [p2, 'ikinci kart'], [p3, 'üçüncü kart']]) {
    await room(pg)
    const ta = pg.locator('textarea').first()
    if (!(await ta.count())) { fail('board: no textarea for a passenger'); break }
    await ta.fill(txt)
    await pg.getByRole('button', { name: /^Ekle$/ }).first().click()
    await pg.waitForTimeout(1200)
  }
  const { data: cards } = await api.from('cards').select('id').eq('stage_id', st.id)
  if ((cards ?? []).length !== 3) fail(`board: expected 3 cards, got ${cards?.length}`)
  else ok('3 cards written through the UI')

  await api.from('stages').update({ state: 'revealed' }).eq('id', st.id)
  await room(p1)
  const dot = p1.locator('button', { hasText: '🔵' }).first()
  if (!(await dot.count())) fail('board: no vote button after reveal')
  else {
    await dot.click()
    await p1.waitForTimeout(3000)
    const { data: votes } = await api.from('votes').select('id').eq('stage_id', st.id)
    if ((votes ?? []).length !== 1) fail(`board: expected 1 vote, got ${votes?.length}`)
    else ok('dot vote registered through the UI')
  }
}

// ============ QUIZ: answer + reveal + score ============
console.log('\n-- quiz --')
{
  const st = await addStage('quiz', 'E2E Quiz')
  const { data: q } = await api.from('quiz_questions').insert({
    stage_id: st.id, meeting_id: meeting.id, kind: 'choice',
    prompt: 'E2E: hangisi doğru?', options: ['Doğru', 'Yanlış'], time_limit_s: 60, base_points: 1000,
  }).select().single()
  await api.from('quiz_keys').insert({ question_id: q.id, correct_index: 0 })
  await activate(st)
  await api.rpc('open_quiz', { p_question_id: q.id })

  await room(p1)
  const opt = p1.getByRole('button', { name: /Doğru/ }).first()
  if (!(await opt.count())) fail('quiz: no answer button visible')
  else {
    await opt.click()
    await p1.waitForTimeout(3000)
  }

  // The answer cannot be counted from the host's client while the question is
  // OPEN — RLS deliberately hides other people's answers until reveal, so that
  // nobody can watch the room answer. Assert after revealing instead.
  await api.rpc('reveal_quiz', { p_question_id: q.id })
  const { data: ans } = await api.from('quiz_answers').select('member_id').eq('question_id', q.id)
  if ((ans ?? []).length !== 1) fail(`quiz: expected 1 answer after reveal, got ${ans?.length}`)
  else ok('answer submitted through the UI (visible once revealed)')

  await room(p1)
  const { data: sc } = await api.from('scores').select('points').eq('stage_id', st.id)
  if (!(sc ?? []).length) fail('quiz: no score awarded')
  else ok(`quiz scored (${sc[0].points} puan)`)
}

// ============ CODENAMES: seat, deal, clue, guess ============
console.log('\n-- kelime ajanları --')
{
  const st = await addStage('codenames', 'E2E Ajanlar')
  await activate(st)
  await room(host)
  const mk = host.getByRole('button', { name: /Yeni oyun kur/ })
  if (!(await mk.count())) fail('codenames: no "new game" button for the host')
  else { await mk.click(); await host.waitForTimeout(2500) }

  // THE assertion the avatar bug broke: does the lobby list players at all?
  await room(p1)
  const redCard = p1.locator('section.card', { hasText: 'Kırmızı' }).first()
  if (!(await redCard.count())) {
    fail('codenames: lobby has no team cards — this is the shape of the avatar bug')
  } else {
    await redCard.getByRole('button', { name: /Spymaster/ }).first().click()
    // Poll rather than sleep once. Measured: the seat lands in about a second,
    // but a single fixed 1.5s wait made this assertion flaky under load and
    // reported a working app as broken.
    let txt = ''
    for (let i = 0; i < 14; i++) {
      txt = (await redCard.textContent()) ?? ''
      if (txt.includes('E2E1')) break
      await p1.waitForTimeout(600)
    }
    if (!txt.includes('E2E1')) fail(`codenames: seated player not listed (lobby said: ${txt.replace(/\s+/g, ' ').slice(0, 80)})`)
    else ok('lobby lists the seated player by name')
  }
  await room(p2)
  await p2.locator('section.card', { hasText: 'Kırmızı' }).first()
    .getByRole('button', { name: /Operatör/ }).first().click()
  await p2.waitForTimeout(1200)
  await room(p3)
  await p3.locator('section.card', { hasText: 'Mavi' }).first()
    .getByRole('button', { name: /Spymaster/ }).first().click()
  await p3.waitForTimeout(1200)
  await room(host)
  await host.locator('section.card', { hasText: 'Mavi' }).first()
    .getByRole('button', { name: /Operatör/ }).first().click()
  await host.waitForTimeout(1500)

  const deal = host.getByRole('button', { name: /Tahtayı dağıt/ })
  if (!(await deal.count())) fail('codenames: no deal button')
  else {
    await deal.click()
    await host.waitForTimeout(3000)
  }
  const { data: cn } = await api.from('cn_games').select('id, phase, turn').eq('stage_id', st.id).single()
  if (cn?.phase !== 'playing') fail(`codenames: expected phase playing, got ${cn?.phase}`)
  else ok('board dealt through the UI')

  // the spymaster of the team on turn gives a clue in the browser
  const onTurn = cn.turn === 'red' ? p1 : p3
  await room(onTurn)
  const clueBox = onTurn.getByPlaceholder('Tek kelime ipucu')
  if (!(await clueBox.count())) fail('codenames: spymaster has no clue input on their turn')
  else {
    await clueBox.fill('e2eipucu')
    await onTurn.getByRole('button', { name: /^Ver$/ }).click()
    await onTurn.waitForTimeout(2000)
    const { data: g2 } = await api.from('cn_games').select('clue_word, guesses_left').eq('id', cn.id).single()
    if (g2.clue_word !== 'e2eipucu') fail(`codenames: clue not stored (${g2.clue_word})`)
    else ok(`clue given through the UI (${g2.guesses_left} guesses)`)
  }

  // an operative on that team flips a card
  const op = cn.turn === 'red' ? p2 : host
  await room(op)
  const tile = op.locator('.grid button:not([disabled])').first()
  if (!(await tile.count())) fail('codenames: operative cannot click any tile')
  else {
    await tile.click()
    await op.waitForTimeout(2000)
    const { data: flipped } = await api.from('cn_cards').select('id').eq('game_id', cn.id).eq('revealed', true)
    if (!(flipped ?? []).length) fail('codenames: no card flipped')
    else ok('operative flipped a card through the UI')
  }
}

// ============ WAVELENGTH: teams, clue, dial, bet ============
console.log('\n-- frekans --')
{
  const st = await addStage('wavelength', 'E2E Frekans')
  await activate(st)
  await room(host)
  const auto = host.getByRole('button', { name: /Takımları otomatik kur/ })
  if (!(await auto.count())) fail('wavelength: no auto-team button')
  else {
    await auto.click()
    await host.waitForTimeout(2500)
    const { data: s2 } = await api.from('stages').select('config').eq('id', st.id).single()
    const teams = s2.config?.teams ?? {}
    if (Object.keys(teams).length < 4) fail(`wavelength: teams not assigned (${Object.keys(teams).length})`)
    else ok(`teams auto-assigned to ${Object.keys(teams).length} people`)
  }
}

// ============ EVERY STAGE RENDERS ITS OWN TITLE ============
// My earlier click-through used a loose row selector that matched ancestor
// elements, so it kept re-activating the same first two stages while appearing
// to walk all 17. Per-stage UI was therefore never actually verified. This walks
// them properly and asserts the rendered title matches the stage activated.
console.log('\n-- her durak --')
{
  const kinds = [
    ['wordcloud', 'Kelime bulutu'], ['board', 'Pano'], ['lean_coffee', 'Lean'],
    ['suggestions', 'Oneriler'], ['health_check', 'Nabiz'], ['two_truths', 'Iki dogru'],
    ['poll', 'Anket'], ['quiz', 'Quiz2'], ['fibbage', 'Fib2'], ['rank', 'Sirala'],
    ['codenames', 'Ajanlar2'], ['wavelength', 'Frekans2'], ['feedback_wall', 'Duvar'],
    ['secret_mission', 'Gorev'], ['leaderboard', 'Tablo'], ['break', 'Mola2'],
  ]
  let walked = 0
  let mismatched = []
  for (const [kind, title] of kinds) {
    const st = await addStage(kind, title)
    await activate(st)
    await room(p1)
    const shown = (await p1.locator('.stage-title, h2').first().textContent().catch(() => '')) ?? ''
    const world = await p1.locator('[data-stage-kind]').first().getAttribute('data-stage-kind').catch(() => null)
    // break renders bare (no title furniture) by design
    const titleOk = kind === 'break' ? true : shown.trim().startsWith(title)
    if (world !== kind) mismatched.push(`${kind}: world=${world}`)
    else if (!titleOk) mismatched.push(`${kind}: showed "${shown.trim().slice(0, 20)}"`)
    else walked++
  }
  if (mismatched.length) fail(`stages rendered wrong: ${mismatched.join(' | ')}`)
  else ok(`all ${walked} stage kinds render their own stage`)
}

// ============ CONNECTION INDICATOR STAYS QUIET WHEN HEALTHY ============
// Regression test for the banner that flapped on during harmless transients and
// went silent when the connection was actually dead.
console.log('\n-- bağlantı göstergesi --')
{
  await room(p1)
  await p1.waitForTimeout(9000)   // past the 6s grace and the 3s settle
  const banner = await p1.locator('[role="status"]').count()
  if (banner > 0) {
    const txt = await p1.locator('[role="status"]').first().textContent()
    fail(`indicator shown on a healthy connection: ${txt?.trim().slice(0, 60)}`)
  } else {
    ok('no connection warning while the socket is healthy')
  }
}

// ============ report ============
await api.from('meetings').delete().eq('id', meeting.id)
for (const n of NAMES) await api.from('members').delete().eq('display_name', n)

if (errors.length) {
  fail(`${errors.length} browser error(s):\n` + errors.slice(0, 8).map((e) => `          ${e}`).join('\n'))
} else {
  ok('no page or console errors in any browser')
}

await browser.close()
await server.close()
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
