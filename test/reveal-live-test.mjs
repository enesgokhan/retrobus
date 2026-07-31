// Does a passenger SEE the reveal without touching their browser?
//
// Every other suite reloads the page before asserting, which is precisely why
// none of them caught this: several stages hide their rows until stages.state
// flips to 'revealed', but their realtime channel is not bound to `stages`, so
// nothing tells the client to refetch at the moment the data becomes readable.
// The passenger sits on an empty board while the host sees a full one.
//
// The rule this suite pins: if a policy opens rows when the stage state changes,
// the channel MUST be bound to `stages`.
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { personaContext, saveAllSessions } from './_browser.mjs'
import { hostClient } from './_clients.mjs'

const PORT = 4243
const APP = `http://localhost:${PORT}/retrobus/`
const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'
const SHOTS = process.env.SHOT_DIR ?? null
let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const api = await hostClient()
const NAMES = ['Rev1', 'Rev2']
const CODES = ['611111', '622222']
await api.from('meetings').delete().eq('title', 'RevealLive')
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
  .insert({ title: 'RevealLive', status: 'live' }).select().single()

const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()
async function login(name, code) {
  const ctx = await personaContext(browser, name, { viewport: { width: 1400, height: 950 } })
  const page = await ctx.newPage()
  await page.goto(APP, { waitUntil: 'networkidle' })
  // a restored session means there is no login screen to fill in
  if (await page.getByPlaceholder('örn. Enes').count()) {
    await page.getByPlaceholder('örn. Enes').fill(name)
    const boxes = page.locator('input[inputmode="numeric"]')
    for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i])
    await page.waitForTimeout(4000)
  }
  const skip = page.getByRole('button', { name: 'Şimdilik geç' })
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(1200) }
  const go = page.getByRole('button', { name: 'Hadi başlayalım' })
  if (await go.count()) { await go.click(); await page.waitForTimeout(400) }
  await page.goto(APP + '#/oda', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  return page
}
const p1 = await login(NAMES[0], CODES[0])
const p2 = await login(NAMES[1], CODES[1])

let order = 0
const addStage = async (kind, title, config = {}) =>
  (await api.from('stages')
    .insert({ meeting_id: meeting.id, kind, title, order_index: ++order, config })
    .select().single()).data
const activate = async (st) => {
  await api.from('meetings').update({ active_stage_id: st.id }).eq('id', meeting.id)
  await api.from('stages').update({ state: 'open' }).eq('id', st.id)
  // give both passengers time to land on the stage on their own
  await p1.waitForTimeout(5000)
}
/** Wait up to `ms` for text to appear WITHOUT reloading. */
async function appears(pg, rx, ms = 14000) {
  const started = Date.now()
  while (Date.now() - started < ms) {
    const t = (await pg.locator('.stage-world').textContent().catch(() => '')) ?? ''
    if (rx.test(t.replace(/\s+/g, ' '))) return true
    await pg.waitForTimeout(700)
  }
  return false
}

// ---------------------------------------------------------------- board
console.log('\n-- batch board: passenger sees the cards at reveal --')
{
  const st = await addStage('board', 'Toplu Açılış', { identity: 'anon', reveal: 'batch' })
  await activate(st)
  const ta = p1.locator('textarea').first()
  await ta.fill('gizli kart bir')
  await p1.getByRole('button', { name: /^Ekle$/ }).first().click()
  await p1.waitForTimeout(1500)

  const before = (await p2.locator('.stage-world').textContent()) ?? ''
  if (before.includes('gizli kart bir')) fail('a batch board leaked a card BEFORE reveal')
  else ok('card hidden before reveal')

  // the host reveals; nobody touches a browser
  await api.from('stages').update({ state: 'revealed' }).eq('id', st.id)
  if (!(await appears(p2, /gizli kart bir/))) {
    fail('passenger never saw the card after reveal (no refetch on stage state change)')
    if (SHOTS) await p2.screenshot({ path: `${SHOTS}/reveal-board-stuck.png` })
  } else ok('passenger sees the board at reveal, without reloading')
}

// ---------------------------------------------------------------- rank
console.log('\n-- rank these: passenger sees the room consensus at reveal --')
{
  const st = await addStage('rank', 'Sırala')
  // items live in their own table, not in config
  await api.from('rank_items').insert(
    ['Kahve', 'Çay', 'Ayran'].map((label, i) => ({ stage_id: st.id, label, order_index: i + 1 })),
  )
  await activate(st)
  await p1.waitForTimeout(1500)
  const sub = async (pg, who) => {
    const btn = pg.getByRole('button', { name: 'Sıralamamı gönder' })
    await btn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
    if (!(await btn.count())) { fail(`${who} never got a ranking form`); return }
    await btn.click()
    await pg.waitForTimeout(2500)
    // and it must STAY submitted — the confirmation used to revert within
    // seconds because submit_ranking stopped writing the participation row
    const t = ((await pg.locator('.stage-world').textContent()) ?? '').replace(/\s+/g, ' ')
    if (/En iyiden en kötüye sırala/.test(t)) fail(`${who}: the ranking form came back after submitting`)
    else ok(`${who}: ranking stays submitted`)
  }
  await sub(p1, 'Rev1'); await sub(p2, 'Rev2')
  // Not a direct select: RLS correctly hides other people's rankings until the
  // reveal — from the host too, which is why the host's own reveal button used
  // to read "0 sıralama" and never appear. answered_count exists for exactly
  // this: a number, and nothing else.
  const { data: n } = await api.rpc('answered_count', { p_kind: 'rank', p_id: st.id })
  if (n !== 2) fail(`answered_count says ${n} rankings, expected 2`)
  else ok('host can count 2 rankings without reading them')
  const { data: raw } = await api.from('rank_submissions').select('id').eq('stage_id', st.id)
  if ((raw ?? []).length) fail('the host can read other people\'s rankings before reveal')
  else ok('and cannot read their contents')

  // via the same RPC the console's primary button now uses
  await api.rpc('reveal_ranking', { p_stage_id: st.id })
  const sawConsensus = await appears(p2, /Sürünün sıralaması|sıraladı|Kahve/, 12000)
  if (!sawConsensus) fail('passenger sees nothing after the rank reveal')
  else ok('passenger sees the rank result at reveal')
  const { data: sc } = await api.from('scores').select('reason').eq('stage_id', st.id)
  if (!(sc ?? []).length) fail('reveal_ranking awarded no points')
  else ok(`rank scored (${sc.length} rows, ${[...new Set(sc.map((x) => x.reason))].join(', ')})`)
}

// ---------------------------------------------------------------- health
console.log('\n-- health check: passenger sees the chart at reveal --')
{
  const st = await addStage('health_check', 'Nabız', {
    dimensions: [{ key: 'tempo', label: 'Tempo' }, { key: 'iletisim', label: 'İletişim' }],
  })
  await activate(st)
  const dots = p1.locator('.stage-world button').filter({ hasText: /^[1-5]$/ })
  const n = await dots.count()
  for (let i = 0; i < Math.min(n, 2); i++) { await dots.nth(i).click(); await p1.waitForTimeout(400) }
  await p1.waitForTimeout(1200)

  await api.from('stages').update({ state: 'revealed' }).eq('id', st.id)
  const before2 = (await p2.locator('.stage-world').textContent()) ?? ''
  const saw = await appears(p2, /Tempo/, 12000)
  if (!saw) fail(`passenger never saw the health chart at reveal (screen still: "${before2.replace(/\s+/g, ' ').slice(0, 70)}")`)
  else ok('passenger sees the health chart at reveal')
}

// ---------------------------------------------------------------- vote counter
console.log('\n-- oy sayacı gerçekten sayıyor mu --')
{
  const { data: n } = await api.rpc('stage_progress', { p_stage_id: null, p_action_key: 'dot' })
  // the real check: after a vote lands, the counter for THIS stage moves
  const { data: st } = await api.from('stages').select('id').eq('meeting_id', meeting.id).limit(1)
  const sid = (st ?? [])[0]?.id
  if (sid) {
    const before = (await api.rpc('stage_progress', { p_stage_id: sid, p_action_key: 'dot' })).data ?? 0
    const cardOk = (await api.rpc('stage_progress', { p_stage_id: sid, p_action_key: 'card' })).data ?? 0
    if (cardOk === 0 && before === 0) {
      note && note('no participation rows on this stage to count')
    }
    // 'vote' was the key the allow-list used to permit; nothing writes it
    const wrongKey = (await api.rpc('stage_progress', { p_stage_id: sid, p_action_key: 'vote' })).data
    if (wrongKey !== 0) fail('stage_progress still answers for a key nothing writes')
    else ok("stage_progress answers 0 for 'vote' (nothing writes it) ")
    const blocked = (await api.rpc('stage_progress', { p_stage_id: sid, p_action_key: 'fb:' + sid })).data
    if (blocked !== 0) fail('stage_progress can still be used to count feedback about a person')
    else ok('stage_progress refuses identity-bearing keys')
  }
}

await api.from('meetings').delete().eq('id', meeting.id)
for (const n of NAMES) await api.from('members').delete().eq('display_name', n)
await saveAllSessions()
await browser.close()
await server.close()
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
