// The shared screen must never show what only one person is allowed to know.
//
// /sunum renders inside whoever's session is casting. The database is careful —
// cn_keys reaches only that game's spymasters, wave_targets only the psychic,
// missions only their owner — and then the presenter view painted all of it on
// the wall. If the host casts while holding any of those roles, the room sees
// the assassin, the target number, or the secret mission.
//
// So this suite does the one thing reading the code cannot: it puts the host in
// each private role and looks at what /sunum actually renders.
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { personaContext, saveAllSessions } from './_browser.mjs'
import { hostClient } from './_clients.mjs'

const PORT = 4244
const APP = `http://localhost:${PORT}/retrobus/`
const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'
const SHOTS = process.env.SHOT_DIR ?? null
let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const api = await hostClient()
const NAMES = ['Pres1', 'Pres2', 'Pres3']
const CODES = ['511111', '522222', '533333']
await api.from('meetings').delete().eq('title', 'Presenter')
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
  .insert({ title: 'Presenter', status: 'live' }).select().single()

const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()
async function login(name, code) {
  const ctx = await personaContext(browser, name, { viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('örn. Enes').fill(name)
  const boxes = page.locator('input[inputmode="numeric"]')
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i])
  await page.waitForTimeout(4000)
  const skip = page.getByRole('button', { name: 'Şimdilik geç' })
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(1200) }
  const go = page.getByRole('button', { name: 'Hadi başlayalım' })
  if (await go.count()) { await go.click(); await page.waitForTimeout(400) }
  return page
}
const host = await login('Enes', HOST_CODE)
const p1 = await login(NAMES[0], CODES[0])
const p2 = await login(NAMES[1], CODES[1])
const p3 = await login(NAMES[2], CODES[2])

let order = 0
const addStage = async (kind, title, config = {}) => {
  const { data, error } = await api.from('stages')
    .insert({ meeting_id: meeting.id, kind, title, order_index: ++order, config })
    .select().single()
  if (error) { console.error('  addStage', kind, 'failed:', error.message); process.exit(1) }
  return data
}
const activate = async (st) => {
  await api.from('meetings').update({ active_stage_id: st.id }).eq('id', meeting.id)
  await api.from('stages').update({ state: 'open' }).eq('id', st.id)
}
const go = async (pg, path) => {
  // Not networkidle — a live realtime socket means the network is never idle,
  // and not a fixed sleep either: the app was still showing "Yükleniyor…" when
  // the assertions ran. Wait for the boot to actually finish.
  await pg.goto(APP + '#' + path, { waitUntil: 'domcontentloaded' })
  await pg.reload({ waitUntil: 'domcontentloaded' })
  await pg
    .waitForFunction(() => !/Yükleniyor/.test(document.body.textContent ?? ''), null, { timeout: 25000 })
    .catch(() => {})
  await pg.waitForTimeout(1500)
}
const seen = async (pg) => ((await pg.locator('body').textContent()) ?? '').replace(/\s+/g, ' ')
const shot = async (pg, n) => { if (SHOTS) await pg.screenshot({ path: `${SHOTS}/pres-${n}.png` }) }

// ------------------------------------------------------- codenames key card
console.log('\n-- codenames: the key must not reach the shared screen --')
{
  const st = await addStage('codenames', 'Ajanlar')
  await activate(st)
  await go(host, '/oda')
  const mk = host.getByRole('button', { name: /Yeni oyun kur/ })
  if (await mk.count()) { await mk.click(); await host.waitForTimeout(2500) }
  else console.log('  · host /oda shows:', (await seen(host)).slice(0, 160))
  await go(host, '/oda')
  // the HOST takes a spymaster seat — the dangerous case, since they cast
  const redSpy = host.locator('section.card', { hasText: 'Kırmızı' }).first()
    .getByRole('button', { name: /Spymaster/ })
  if (await redSpy.count()) { await redSpy.first().click(); await host.waitForTimeout(1200) }
  // Four seats, four browsers: both teams need a spymaster AND an operative,
  // which is now enforced — a team with only a spymaster deadlocks the moment
  // its turn arrives, since spymasters may neither guess nor pass.
  for (const [pg, team, spy] of [[p1, 'Mavi', true], [p2, 'Kırmızı', false], [p3, 'Mavi', false]]) {
    await go(pg, '/oda')
    const b = pg.locator('section.card', { hasText: team }).first()
      .getByRole('button', { name: spy ? /Spymaster/ : /Operatör/ })
    if (await b.count()) { await b.first().click(); await pg.waitForTimeout(1200) }
  }
  await go(host, '/oda')
  const { data: games } = await api.from('cn_games').select('id, phase')
    .eq('stage_id', st.id).order('created_at', { ascending: false })
  const g0 = (games ?? [])[0]
  if (!g0) fail('no codenames game was created — cannot test the key card')
  const deal = host.getByRole('button', { name: /Tahtayı dağıt/ })
  if (!(await deal.count())) fail('board could not be dealt with both roles filled on both teams')
  else { await deal.click(); await host.waitForTimeout(2500); ok('board dealt only once each team had an operative') }

  const { data: keys } = await api.from('cn_keys').select('card_id, role').eq('game_id', g0?.id ?? '00000000-0000-0000-0000-000000000000')
  if (!(keys ?? []).length) { fail('host-spymaster could not read their own key — setup wrong') }

  // the room screen
  await go(host, '/sunum')
  await shot(host, 'cn-sunum')
  const marks = await host.locator('.grid.grid-cols-5 button').getByText(/💀|🔴|🔵|⬜/).count()
  if (marks > 0) fail(`the shared screen shows ${marks} key marks — the room can see the colours`)
  else ok('shared screen shows no key marks')

  // and the spymaster still sees it on their OWN screen
  await go(host, '/oda')
  const own = await host.locator('.grid.grid-cols-5 button').getByText(/💀|🔴|🔵|⬜/).count()
  if (own === 0) fail('the spymaster lost their own key card — the fix went too far')
  else ok(`spymaster still sees the key on their own screen (${own} marks)`)
}

// ------------------------------------------------------- wavelength target
console.log('\n-- wavelength: the target must not reach the shared screen --')
{
  const st = await addStage('wavelength', 'Frekans')
  await activate(st)
  await go(host, '/oda')
  const auto = host.getByRole('button', { name: /Takımları otomatik kur/ })
  if (await auto.count()) { await auto.click(); await host.waitForTimeout(2000) }
  await go(host, '/oda')
  const sel = host.locator('select').last()
  // make the HOST the psychic — again the dangerous case
  await sel.selectOption(idOf('Enes')).catch(() => {})
  await host.waitForTimeout(400)
  const start = host.getByRole('button', { name: 'Yeni tur' })
  if (await start.count()) { await start.click(); await host.waitForTimeout(2200) }

  const round = (await api.from('wave_rounds').select('*').eq('stage_id', st.id).order('order_index')).data?.at(-1)
  if (!round) { fail('no wavelength round was started — cannot test the target'); }
  else {
  const { data: tgt } = await api.from('wave_targets').select('target').eq('round_id', round.id)
  const target = (tgt ?? [])[0]?.target
  if (target == null) { fail('host-psychic could not read their own target — setup wrong') }
  else ok(`psychic can read the target (${target})`)

  await go(host, '/oda')
  // the target arrives on a second round trip; wait for it rather than racing
  let ownText = ''
  for (let i = 0; i < 12; i++) {
    ownText = await seen(host)
    if (ownText.includes(`Hedef ${target}`)) break
    await host.waitForTimeout(700)
  }
  if (!ownText.includes(`Hedef ${target}`)) {
    fail('the psychic never saw their own target')
    console.log('  · psychic /oda shows:', ownText.slice(0, 200))
  } else ok('psychic still sees the target on their own screen')
  if (ownText.includes('Hedef null')) fail('the psychic screen printed the literal string "null"')

  await go(host, '/sunum')
  await shot(host, 'wave-sunum')
  const roomText = await seen(host)
  if (roomText.includes(`Hedef ${target}`)) fail('the shared screen prints the target number')
  else ok('shared screen does not print the target')
  // the bands are as much of a giveaway as the number
  const bands = await host.locator('.stage-world .bg-white\\/25').count()
  if (bands > 0) fail(`the shared screen draws ${bands} target bands`)
  else ok('shared screen draws no target bands')
  }
}

// ------------------------------------------------------- secret missions
console.log('\n-- secret missions: the host\'s own must not reach the screen --')
{
  const st = await addStage('secret_mission', 'Gizli Görevler')
  await activate(st)
  // missions are assigned by RPC, not by direct insert (the table refuses one)
  const { error: mErr } = await api.rpc('assign_missions', {
    p_meeting_id: meeting.id, p_pool: ['GIZLIGOREV42'],
  })
  if (mErr) fail(`could not assign missions: ${mErr.message}`)
  await go(host, '/oda')
  const ownText = await seen(host)
  if (!ownText.includes('GIZLIGOREV42')) fail('the host lost their own mission on their own screen')
  else ok('host sees their own mission privately')

  await go(host, '/sunum')
  await shot(host, 'mission-sunum')
  const roomText = await seen(host)
  if (roomText.includes('GIZLIGOREV42')) fail('the shared screen shows the secret mission')
  else ok('shared screen keeps the mission secret')
}

await api.from('meetings').delete().eq('id', meeting.id)
for (const n of NAMES) await api.from('members').delete().eq('display_name', n)
await saveAllSessions()
await browser.close()
await server.close()
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
