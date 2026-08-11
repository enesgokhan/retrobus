// Capture every screen at desktop width, so a design review looks at the app
// instead of at the source. Not a test — a camera.
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { hostClient } from './_clients.mjs'

const PORT = 4250
const APP = `http://localhost:${PORT}/retrobus/`
const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'
const OUT = process.env.SHOT_DIR ?? '/tmp'

const api = await hostClient()
const NAMES = ['Gal1', 'Gal2', 'Gal3']
const CODES = ['711111', '722222', '733333']
await api.from('meetings').delete().eq('title', 'Galeri')
for (const n of NAMES) {
  await api.from('members').delete().eq('display_name', n)
  await api.from('members').insert({ display_name: n })
}
const { data: roster } = await api.from('members').select('id, display_name')
const idOf = (n) => roster.find((r) => r.display_name === n)?.id
for (let i = 0; i < NAMES.length; i++) {
  await api.rpc('set_member_code', { p_member_id: idOf(NAMES[i]), p_code: CODES[i] })
}
const { data: meeting } = await api.from('meetings').insert({
  title: 'Galeri', status: 'live',
  welcome_note: 'Bu otobüs bir yıllık işin, kavganın ve kahkahanın üstünden geçiyor. Kemerini bağla.',
}).select().single()

const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()
async function login(name, code, avatar = true) {
  // Width/height are settable so the same camera can shoot the phone pass:
  //   W=430 H=930 SHOT_DIR=... node test/_gallery.mjs
  const ctx = await browser.newContext({
    viewport: { width: Number(process.env.W ?? 1600), height: Number(process.env.H ?? 1000) },
    locale: 'tr-TR',
    isMobile: process.env.W ? Number(process.env.W) < 700 : false,
    hasTouch: process.env.W ? Number(process.env.W) < 700 : false,
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  // The light theme is a real, shippable choice behind a toggle in the host's
  // nav, and until now this camera could only ever shoot the dark one — which
  // is how fourteen colours picked for a black ground survived in it.
  //   THEME=light SHOT_DIR=… node test/_gallery.mjs
  if (process.env.THEME) {
    await page.addInitScript((t) => localStorage.setItem('retrobus.theme', t), process.env.THEME)
  }
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  return { page, ctx, name, code, avatar }
}
const credentials = async ({ page, name, code }) => {
  const nameBox = page.getByPlaceholder('örn. Enes')
  if (!(await nameBox.count())) return // already past this step
  await nameBox.fill(name)
  const boxes = page.locator('input[inputmode="numeric"]')
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i])
  await page.waitForTimeout(4000)
}
const finishLogin = async (sess) => {
  const { page, avatar } = sess
  await credentials(sess)
  const pick = page.locator('button').filter({ hasText: /^[\p{Emoji}]/u })
  if (avatar && (await pick.count()) > 3) { await pick.nth(3).click(); await page.waitForTimeout(800) }
  const skip = page.getByRole('button', { name: 'Şimdilik geç' })
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(1200) }
  const go = page.getByRole('button', { name: 'Hadi başlayalım' })
  if (await go.count()) { await go.click(); await page.waitForTimeout(600) }
}

const shot = async (pg, name, full = false) => {
  await pg.screenshot({ path: `${OUT}/g-${name}.png`, fullPage: full })
  console.log('  📸', name)
}
const go = async (pg, path) => {
  await pg.goto(APP + '#' + path, { waitUntil: 'domcontentloaded' })
  await pg.reload({ waitUntil: 'domcontentloaded' })
  await pg
    .waitForFunction(() => !/Yükleniyor/.test(document.body.textContent ?? ''), null, { timeout: 25000 })
    .catch(() => {})
  await pg.waitForTimeout(1800)
  // the welcome note is modal and returns after every reload
  const go2 = pg.getByRole('button', { name: 'Hadi başlayalım' })
  if (await go2.count()) { await go2.click(); await pg.waitForTimeout(700) }
}

// ---- login, before anything else ----
const h = await login('Enes', HOST_CODE)
await shot(h.page, '01-login-empty')
await h.page.getByPlaceholder('örn. Enes').fill('Enes')
await h.page.waitForTimeout(600)
await shot(h.page, '02-login-name')
const hb = h.page.locator('input[inputmode="numeric"]')
for (let i = 0; i < 6; i++) await hb.nth(i).fill(HOST_CODE[i])
await h.page.waitForTimeout(4000)
await shot(h.page, '03-login-after-code')
await finishLogin(h)
const host = h.page

const others = []
for (let i = 0; i < NAMES.length; i++) {
  const o = await login(NAMES[i], CODES[i])
  await finishLogin(o)
  others.push(o.page)
}
const [p1, p2, p3] = others

let order = 0
const addStage = async (kind, title, config = {}) => {
  const { data, error } = await api.from('stages')
    .insert({ meeting_id: meeting.id, kind, title, order_index: ++order, config })
    .select().single()
  if (error) { console.error('  addStage', kind, error.message); process.exit(1) }
  return data
}
const activate = async (st, state = 'open') => {
  await api.from('meetings').update({ active_stage_id: st.id }).eq('id', meeting.id)
  await api.from('stages').update({ state }).eq('id', st.id)
}

// ---- console, empty ----
await go(host, '/host')
await shot(host, '04-console-empty', true)

// ---- a real agenda ----
const board = await addStage('board', 'Neler İyi Gitti', { identity: 'anon', reveal: 'live', dots: 3 })
const lean = await addStage('lean_coffee', 'Lean Coffee', {})
const cloud = await addStage('wordcloud', 'Tek Kelimeyle Yıl', {})
const health = await addStage('health_check', 'Takım Nabzı', {})
const fb = await addStage('feedback_wall', 'Teşekkür Duvarı', { mode: 'kudos' })
const tt = await addStage('two_truths', 'İki Doğru Bir Yalan', {})
const quiz = await addStage('quiz', 'Bilgi Yarışması', {})
const fib = await addStage('fibbage', 'İnandırıcı Yalan', {})
const rank = await addStage('rank', 'Sırala Bakalım', {})
const cn = await addStage('codenames', 'Kelime Ajanları', {})
const wave = await addStage('wavelength', 'Frekans', {})
const brk = await addStage('break', 'Mola', { minutes: 10 })
const lb = await addStage('leaderboard', 'Şampiyonluk Tablosu', {})
await go(host, '/host')
await shot(host, '05-console-full', true)

// ---- board: live + cards ----
await activate(board)
for (const [pg, body] of [
  [p1, 'Sprint planlamayı sadeleştirmemiz herkesin işini kolaylaştırdı'],
  [p2, 'Yeni deploy hattı — artık cuma günü bile korkmuyoruz'],
  [p3, 'Birbirimize soru sormak kolaylaştı, kimse takılıp kalmıyor'],
]) {
  await go(pg, '/oda')
  const ta = pg.locator('textarea').first()
  if (await ta.count()) {
    await ta.fill(body)
    const add = pg.getByRole('button', { name: /^Ekle$/ }).first()
    if (await add.count()) { await add.click(); await pg.waitForTimeout(1200) }
  }
}
await go(p1, '/oda')
await shot(p1, '06-board-player', true)
await go(host, '/oda')
await shot(host, '07-board-host', true)
await api.from('stages').update({ state: 'revealed' }).eq('id', board.id)
await go(p1, '/oda')
await shot(p1, '08-board-revealed', true)

// ---- other discussion stages ----
for (const [st, label] of [[lean, '09-lean'], [cloud, '10-wordcloud'], [health, '11-health'], [fb, '12-feedback']]) {
  await activate(st)
  await go(p1, '/oda')
  await shot(p1, label, true)
}

// ---- games ----
await activate(tt)
await go(p1, '/oda')
await shot(p1, '13-two-truths', true)

await activate(quiz)
await go(host, '/oda')
await shot(host, '14-quiz-empty', true)

await activate(fib)
await api.rpc('create_fibbage_round', {
  p_stage_id: fib.id, p_prompt: 'Enes ilk maaşıyla ne aldı?', p_truth: 'İkinci el bir gitar', p_multiplier: 1,
})
await go(p1, '/oda')
await shot(p1, '15-fibbage-lie', true)

await activate(rank)
await api.from('rank_items').insert(
  ['Cuma deploy', 'Pazartesi toplantısı', 'Açık ofis', 'Uzaktan çalışma'].map((label, i) => ({
    stage_id: rank.id, label, order_index: i + 1,
  })),
)
await go(p1, '/oda')
await shot(p1, '16-rank', true)

// codenames: lobby, then a dealt board from both points of view
await activate(cn)
await go(host, '/oda')
const mk = host.getByRole('button', { name: /Yeni oyun kur/ })
if (await mk.count()) { await mk.click(); await host.waitForTimeout(2500) }
await go(host, '/oda')
await shot(host, '17-codenames-lobby', true)
const seat = async (pg, team, spy) => {
  await go(pg, '/oda')
  const card = pg.locator('section.card', { hasText: team }).first()
  const b = card.getByRole('button', { name: spy ? /Spymaster/ : /Operatör/ })
  if (await b.count()) { await b.first().click(); await pg.waitForTimeout(1200) }
}
await seat(host, 'Kırmızı', true)
await seat(p1, 'Kırmızı', false)
await seat(p2, 'Mavi', true)
await seat(p3, 'Mavi', false)
await go(host, '/oda')
const deal = host.getByRole('button', { name: /Tahtayı dağıt/ })
if (await deal.count()) { await deal.click(); await host.waitForTimeout(2500) }
await go(host, '/oda')
await shot(host, '18-codenames-spymaster', true)
await go(p1, '/oda')
await shot(p1, '19-codenames-operative', true)
await go(host, '/sunum')
await shot(host, '20-codenames-presenter', true)

// wavelength
await activate(wave)
await go(host, '/oda')
const auto = host.getByRole('button', { name: /Takımları otomatik kur/ })
if (await auto.count()) { await auto.click(); await host.waitForTimeout(2000) }
await go(host, '/oda')
const sel = host.locator('select').last()
await sel.selectOption(idOf('Enes')).catch(() => {})
await host.waitForTimeout(400)
const startR = host.getByRole('button', { name: 'Yeni tur' })
if (await startR.count()) { await startR.click(); await host.waitForTimeout(2200) }
await go(host, '/oda')
await shot(host, '21-wavelength-psychic', true)
await go(p1, '/oda')
await shot(p1, '22-wavelength-player', true)

// ---- finale ----
await activate(brk)
await go(p1, '/oda')
await shot(p1, '23-break', true)
await activate(lb, 'revealed')
await go(p1, '/oda')
await p1.waitForTimeout(5000)
await shot(p1, '24-leaderboard', true)
await go(host, '/sunum')
await host.waitForTimeout(5000)
await shot(host, '25-leaderboard-presenter', true)

// ---- the rest of the chrome ----
for (const [path, label] of [
  ['/host/uyeler', '26-members'],
  ['/kurallar', '27-rules'],
  ['/profil', '28-profile'],
  ['/yillik', '29-yearbook'],
  ['/tani', '30-tani'],
]) {
  await go(host, path)
  await shot(host, label, true)
}

await api.from('meetings').delete().eq('id', meeting.id)
for (const n of NAMES) await api.from('members').delete().eq('display_name', n)
await browser.close()
await server.close()
console.log('\ngallery complete')
