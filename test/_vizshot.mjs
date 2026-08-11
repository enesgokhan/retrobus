// Two states the default gallery never reaches: a route half-travelled, and a
// health check with real answers in it. Both are the states the visuals exist
// for, so both need looking at.
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { hostClient } from './_clients.mjs'

const PORT = 4271
const APP = `http://localhost:${PORT}/retrobus/`
const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'
const OUT = process.env.SHOT_DIR ?? '/tmp'

const api = await hostClient()
const NAMES = ['Viz1', 'Viz2', 'Viz3', 'Viz4']
const CODES = ['811111', '822222', '833333', '844444']
await api.from('meetings').delete().eq('title', 'Viz')
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
  .insert({ title: 'Viz', status: 'live' })
  .select()
  .single()

// a route with a believable middle
const KINDS = [
  ['board', 'Neler İyi Gitti'], ['lean_coffee', 'Lean Coffee'], ['wordcloud', 'Tek Kelimeyle Yıl'],
  ['health_check', 'Takım Nabzı'], ['two_truths', 'İki Doğru Bir Yalan'], ['quiz', 'Bilgi Yarışması'],
  ['fibbage', 'İnandırıcı Yalan'], ['codenames', 'Kelime Ajanları'], ['wavelength', 'Frekans'],
  ['break', 'Mola'], ['feedback_wall', 'Teşekkür Duvarı'], ['leaderboard', 'Şampiyonluk Tablosu'],
]
const stages = []
for (let i = 0; i < KINDS.length; i++) {
  const { data } = await api
    .from('stages')
    .insert({
      meeting_id: meeting.id,
      kind: KINDS[i][0],
      title: KINDS[i][1],
      order_index: i + 1,
      config: { timer_s: 600 },
      // the first four are behind us
      state: i < 4 ? 'closed' : 'pending',
    })
    .select()
    .single()
  stages.push(data)
}
// stop five is live
const live = stages[4]
await api.from('stages').update({ state: 'open' }).eq('id', live.id)
await api.from('meetings').update({ active_stage_id: live.id }).eq('id', meeting.id)

// real health answers, deliberately uneven: one dimension the room is split on
const health = stages[3]
const DIMS = ['fun', 'teamwork', 'learning', 'speed', 'mission', 'support']
const ANSWERS = {
  fun: [3, 3, 3, 2],
  teamwork: [3, 3, 2, 3],
  learning: [2, 2, 3, 2],
  speed: [1, 1, 2, 1],
  mission: [3, 1, 3, 1], // the split one
  support: [2, 3, 3, 3],
}
// The answers go in through the real writer.
//
// The first version of this probe INSERTed straight into health_responses,
// which the schema revokes for everyone — the table is written only through
// submit_health(), a SECURITY DEFINER RPC that stamps participation and
// enforces one answer per person per dimension. The insert failed silently,
// the probe reported success, and it screenshotted a chart with every count at
// zero, which I nearly read as a charting bug. Seeded rows are not evidence
// about a write path.
await api.from('stages').update({ state: 'open' }).eq('id', health.id)
await api.from('meetings').update({ active_stage_id: health.id }).eq('id', meeting.id)

const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()

async function signIn(name, code) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'tr-TR' })
  const pg = await ctx.newPage()
  pg.on('pageerror', (e) => console.log(`!! ${name} JS:`, e.message.slice(0, 160)))
  await pg.goto(APP, { waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(1400)
  await pg.getByPlaceholder('örn. Enes').fill(name)
  const boxes = pg.locator('input[inputmode="numeric"]')
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i])
  await pg.waitForTimeout(4200)
  const skip = pg.getByRole('button', { name: 'Şimdilik geç' })
  if (await skip.count()) { await skip.click(); await pg.waitForTimeout(900) }
  return pg
}

const pg = await signIn('Enes', HOST_CODE)

// four people actually answering, by pressing the buttons
const LABEL = { 1: 'Kötü', 2: 'Orta', 3: 'İyi' }
const DIM_LABEL = {
  fun: 'Eğlence', teamwork: 'Takım Çalışması', learning: 'Öğrenme',
  speed: 'Hız', mission: 'Misyon', support: 'Destek',
}
for (let person = 0; person < NAMES.length; person++) {
  const p = await signIn(NAMES[person], CODES[person])
  await p.goto(APP + '#/oda', { waitUntil: 'domcontentloaded' })
  await p.reload({ waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2400)
  const start = p.getByRole('button', { name: 'Hadi başlayalım' })
  if (await start.count()) { await start.click(); await p.waitForTimeout(600) }
  for (const d of DIMS) {
    const row = p.locator('.list-row').filter({ hasText: DIM_LABEL[d] }).first()
    const btn = row.getByRole('button', { name: new RegExp(LABEL[ANSWERS[d][person]]) }).first()
    if (await btn.count()) { await btn.click(); await p.waitForTimeout(220) }
  }
  await p.context().close()
}

const { count } = await api
  .from('health_responses')
  .select('*', { count: 'exact', head: true })
  .eq('stage_id', health.id)
console.log(`${count} health answers written through the UI`)
if (!count) { console.error('nothing was written — the probe proves nothing'); process.exit(1) }
const go = async (path) => {
  await pg.goto(APP + '#' + path, { waitUntil: 'domcontentloaded' })
  await pg.reload({ waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(2600)
  const start = pg.getByRole('button', { name: 'Hadi başlayalım' })
  if (await start.count()) { await start.click(); await pg.waitForTimeout(700) }
}

// The shared screen WHILE the room votes — the state that used to render six
// labels and nothing else, because the controls are hidden on a projector and
// nothing took their place. Shot before the reveal, deliberately: after it, the
// chart is up and this state is gone.
await api.from('meetings').update({ active_stage_id: health.id }).eq('id', meeting.id)
await go('/sunum')
await pg.screenshot({ path: `${OUT}/viz-health-voting.png` })
{
  // A screenshot proves the page rendered, not that it says anything true.
  // These counts come from `stage_progress`, which returns 0 for a reader it
  // does not recognise — so an unauthenticated or mis-scoped probe would
  // photograph six tidy empty bars and look like a success.
  const shown = await pg.locator('text=/\\b[1-9]\\d*\\/\\d+\\b/').count()
  if (!shown) {
    console.error('the shared screen shows no per-dimension counts — the voting state is still blank')
    process.exit(1)
  }
  console.log(`${shown} live dimension counts on the shared screen`)
}
console.log('📸 health check, shared screen, mid-vote')

await api.from('stages').update({ state: 'revealed' }).eq('id', health.id)
await api.from('meetings').update({ active_stage_id: live.id }).eq('id', meeting.id)

await go('/host')
await pg.screenshot({ path: `${OUT}/viz-route.png`, fullPage: true })
console.log('📸 route (4 stops behind, 1 live)')

// the health chart: point the room at the revealed health stop
await api.from('meetings').update({ active_stage_id: health.id }).eq('id', meeting.id)
await go('/oda')
await pg.screenshot({ path: `${OUT}/viz-health.png` })
console.log('📸 health chart (revealed, one split dimension)')

await browser.close()
await server.close()
console.log('done')
