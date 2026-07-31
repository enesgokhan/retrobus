// THE NIGHT WON'T GO TO PLAN.
//
// The rehearsal proves the happy path works. This one does what a real evening
// does to an app: people arrive late, refresh at the worst moment, open two
// tabs, type an essay, leave a stage half-finished, and the host clicks the
// wrong thing and needs to undo it. None of that is exotic — all of it will
// happen on the night with ten people.
//
// Anything that ends with a stuck screen, a lost answer, or a number that lies
// is a defect.
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { personaContext, saveAllSessions } from './_browser.mjs'
import { hostClient } from './_clients.mjs'

const PORT = 4262
const APP = `http://localhost:${PORT}/retrobus/`
const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'
const SHOTS = process.env.SHOT_DIR ?? null
let shots = 0

const problems = []
const notes = []
const bad = (w, m) => { problems.push(`[${w}] ${m}`); console.log(`  ✗ ${w}: ${m}`) }
const ok = (m) => console.log(`  ✓ ${m}`)
const note = (m) => { notes.push(m); console.log(`  · ${m}`) }

const api = await hostClient()
const CAST = [
  { name: 'Ayla', code: '211111' },
  { name: 'Bora', code: '222222' },
]
await api.from('meetings').delete().eq('title', 'DagınıkGece')
for (const c of CAST) await api.from('members').delete().eq('display_name', c.name)
for (const c of CAST) {
  await api.from('members').insert({ display_name: c.name })
}
const { data: roster } = await api.from('members').select('id, display_name')
const idOf = (n) => roster.find((r) => r.display_name === n)?.id
for (const c of CAST) await api.rpc('set_member_code', { p_member_id: idOf(c.name), p_code: c.code })

// one live meeting, built the way the console builds it
await api.from('meetings').update({ status: 'done', active_stage_id: null }).eq('status', 'live')
const { data: meeting } = await api.from('meetings')
  .insert({ title: 'DagınıkGece', status: 'live' }).select().single()
const mk = async (kind, title, config = {}, order) =>
  (await api.from('stages').insert({ meeting_id: meeting.id, kind, title, order_index: order, config })
    .select().single()).data
const board = await mk('board', 'Neler İyi Gitti', { identity: 'anon', reveal: 'batch', dots: 3 }, 1)
const quiz = await mk('quiz', 'Bilgi Yarışması', {}, 2)

const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()
const jsErrors = []
async function open(label) {
  const ctx = await personaContext(browser, label, { viewport: { width: 1500, height: 950 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => jsErrors.push(`${label}: ${e.message.slice(0, 130)}`))
  page.on('response', async (r) => {
    if (r.status() < 400) return
    let why = ''
    try { why = (await r.text()).slice(0, 120) } catch { /* gone */ }
    jsErrors.push(`${label}: ${r.status()} ${r.url().split('?')[0].replace(/^https?:\/\/[^/]+/, '')} ${why}`)
  })
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await settle(page)
  return page
}
async function settle(pg, ms = 1200) {
  await pg.waitForFunction(() => !/Yükleniyor/.test(document.body.textContent ?? ''), null, { timeout: 25000 })
    .catch(() => {})
  await pg.waitForTimeout(ms)
  const w = pg.getByRole('button', { name: 'Hadi başlayalım' })
  if (await w.count()) { await w.click(); await pg.waitForTimeout(400) }
}
const go = async (pg, path) => {
  await pg.goto(APP + '#' + path, { waitUntil: 'domcontentloaded' })
  await settle(pg)
}
const text = async (pg) => ((await pg.locator('body').textContent()) ?? '').replace(/\s+/g, ' ')
const shot = async (pg, n) => { if (SHOTS) await pg.screenshot({ path: `${SHOTS}/m${++shots}-${n}.png`, fullPage: true }) }
async function login(pg, name, code) {
  const nb = pg.getByPlaceholder('örn. Enes')
  if (!(await nb.count())) return
  await nb.fill(name)
  const boxes = pg.locator('input[inputmode="numeric"]')
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i])
  await pg.waitForTimeout(4500)
  const skip = pg.getByRole('button', { name: 'Şimdilik geç' })
  if (await skip.count()) { await skip.click(); await pg.waitForTimeout(800) }
  await settle(pg)
}

const host = await open('host')
await login(host, 'Enes', HOST_CODE)
const ayla = await open('Ayla')
await login(ayla, CAST[0].name, CAST[0].code)

const activate = async (st) => {
  await api.from('meetings').update({ active_stage_id: st.id }).eq('id', meeting.id)
  await api.from('stages').update({ state: 'open' }).eq('id', st.id)
  await ayla.waitForTimeout(4000)
}

// =====================================================================
console.log('\n-- 1. biri yazarken tarayıcıyı yeniliyor --')
await activate(board)
await go(ayla, '/oda')
{
  const ta = ayla.locator('textarea').first()
  if (!(await ta.count())) bad('pano', 'no way to write on an open board')
  else {
    await ta.fill('Bu cümleyi yazarken sayfayı yenileyeceğim')
    await ayla.reload({ waitUntil: 'domcontentloaded' })
    await settle(ayla)
    const t = await text(ayla)
    // losing an unsent draft is acceptable; being unable to write again is not
    const again = ayla.locator('textarea').first()
    if (!(await again.count())) bad('pano', 'after a refresh mid-typing there is no way to write at all')
    else ok('refreshing mid-typing leaves you able to write again')
    if (/undefined|NaN|\[object/.test(t)) bad('pano', 'the screen shows a broken value after refresh')
  }
}

// =====================================================================
console.log('\n-- 2. aynı kişi iki sekmede --')
{
  const second = await open('Ayla-2')
  await login(second, CAST[0].name, CAST[0].code)
  await go(second, '/oda')
  await go(ayla, '/oda')
  const a = ayla.locator('textarea').first()
  const b = second.locator('textarea').first()
  if ((await a.count()) && (await b.count())) {
    await a.fill('birinci sekmeden')
    await ayla.getByRole('button', { name: /^(Ekle|＋ .+)$/ }).first().click().catch(() => {})
    await ayla.waitForTimeout(1600)
    await b.fill('ikinci sekmeden')
    await second.getByRole('button', { name: /^(Ekle|＋ .+)$/ }).first().click().catch(() => {})
    await second.waitForTimeout(1600)
    const { data: cards } = await api.from('cards').select('id, body').eq('stage_id', board.id)
    const bodies = (cards ?? []).map((c) => c.body)
    if (bodies.includes('birinci sekmeden') && bodies.includes('ikinci sekmeden')) {
      ok('the same person in two tabs can write from both')
    } else {
      note(`two tabs produced: ${bodies.join(' | ') || '(nothing)'}`)
    }
    // and the room count must not double-count them
    const { data: present } = await api.rpc('present_members', { p_within_seconds: 120 })
    const ids = (present ?? []).map((p) => p.member_id)
    if (new Set(ids).size !== ids.length) bad('varlık', 'a person in two tabs is counted twice in the room')
    else ok('two tabs count as one person in the room')
  }
  await second.close()
}

// =====================================================================
console.log('\n-- 3. şoför yanlışlıkla açtı, geri alıyor --')
{
  await api.from('stages').update({ state: 'revealed' }).eq('id', board.id)
  await go(host, '/host')
  const back = host.getByRole('button', { name: /Geri/ }).first()
  if (!(await back.count())) bad('konsol', 'a stop revealed by mistake cannot be taken back')
  else {
    await back.click()
    await host.waitForTimeout(1800)
    const { data: st } = await api.from('stages').select('state').eq('id', board.id).single()
    if (st?.state !== 'open') bad('konsol', `undo left the stop at "${st?.state}" instead of open`)
    else ok('the host can undo a reveal')
    await go(ayla, '/oda')
    const ta = ayla.locator('textarea').first()
    if (!(await ta.count())) bad('pano', 'after the undo the room still cannot write')
    else ok('after the undo the room can write again')
  }
}

// =====================================================================
console.log('\n-- 4. çok uzun ve tuhaf metin --')
{
  await go(ayla, '/oda')
  const ta = ayla.locator('textarea').first()
  if (await ta.count()) {
    const nasty = 'Ünlü İIıi ' + '🎉'.repeat(20) + ' <script>alert(1)</script> ' + 'çok uzun '.repeat(60)
    await ta.fill(nasty)
    const btn = ayla.getByRole('button', { name: /Ekle|＋/ }).first()
    if (await btn.count()) { await btn.click(); await ayla.waitForTimeout(1500) }
    const { data: cards } = await api.from('cards').select('body').eq('stage_id', board.id)
    const long = (cards ?? []).find((c) => c.body.includes('<script>'))
    if (long) {
      ok('awkward text is stored as plain text')
      const t = await text(ayla)
      if (t.includes('alert(1)') && !(await ayla.locator('script:has-text("alert(1)")').count())) {
        ok('and rendered as text, not executed')
      }
    }
    const t2 = await text(ayla)
    if (/undefined|NaN/.test(t2)) bad('pano', 'long/odd text broke the screen')
    // and the layout must not blow out
    const overflow = await ayla.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 4)
    if (overflow) bad('pano', 'a long unbroken card makes the page scroll sideways')
    else ok('no horizontal overflow from a very long card')
    await shot(ayla, 'long-text')
  }
}

// =====================================================================
console.log('\n-- 5. geç gelen yolcu --')
{
  const bora = await open('Bora')
  await login(bora, CAST[1].name, CAST[1].code)
  await go(bora, '/oda')
  const t = await text(bora)
  if (/Yükleniyor|undefined/.test(t)) bad('geç giriş', 'a late arrival lands on a broken screen')
  else ok('a late arrival lands on the current stop')
  const ta = bora.locator('textarea').first()
  if (!(await ta.count())) bad('geç giriş', 'a late arrival cannot take part in the open stop')
  else ok('a late arrival can take part straight away')
  await bora.close()
}

// =====================================================================
console.log('\n-- 6. boş quiz açılırsa --')
{
  await activate(quiz)
  await go(ayla, '/oda')
  const t = await text(ayla)
  if (/undefined|NaN|\[object/.test(t)) bad('quiz', 'an empty quiz shows a broken value')
  else ok('an empty quiz does not show broken values')
  const told = /hazırlan|bekliyor|Şoför|yok/i.test(t)
  if (!told) bad('quiz', `an empty quiz leaves the room with no explanation — "${t.slice(100, 200)}"`)
  else ok('an empty quiz tells the room to wait')
  await shot(ayla, 'empty-quiz')
}

// ---------------------------------------------------------------- report
console.log('\n════════════ RAPOR ════════════')
if (jsErrors.length) {
  for (const e of [...new Set(jsErrors)].slice(0, 10)) bad('js', e)
} else ok('no browser or network errors during any of it')
console.log(`\nproblems: ${problems.length}`)
problems.forEach((p) => console.log('  ' + p))
if (notes.length) { console.log(`\nnotes: ${notes.length}`); notes.forEach((n) => console.log('  ' + n)) }

await api.from('meetings').delete().eq('id', meeting.id)
for (const c of CAST) await api.from('members').delete().eq('display_name', c.name)
await saveAllSessions()
await browser.close()
await server.close()
process.exit(problems.length ? 1 : 0)
