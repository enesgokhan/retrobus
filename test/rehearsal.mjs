// FULL DRESS REHEARSAL — the whole meeting, driven only through the UI.
//
// Every other suite fabricates state by writing to the database directly, which
// is why they keep passing while the app is "far from professionally usable":
// they never walk the path a host actually walks. This one touches the database
// for exactly two things — reading back what the UI produced, and cleaning up
// afterwards. Everything else is clicks.
//
// A host on the night must be able to: add passengers, give them codes, build a
// run of show, start it, drive every stop from the console, and end with a
// leaderboard and a yearbook. Anything that cannot be done by clicking is a
// defect, no matter how well it works over RPC.
//
//   node test/rehearsal.mjs            # run it
//   SHOT_DIR=/tmp/x node test/rehearsal.mjs   # and keep screenshots
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { hostClient } from './_clients.mjs'
import { personaContext, saveAllSessions } from './_browser.mjs'

const PORT = 4260
const APP = `http://localhost:${PORT}/retrobus/`
const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'
const SHOTS = process.env.SHOT_DIR ?? null

const problems = []
const notes = []
let step = 0
const bad = (where, msg) => { problems.push(`[${where}] ${msg}`); console.log(`  ✗ ${where}: ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)
const note = (msg) => { notes.push(msg); console.log(`  · ${msg}`) }

const api = await hostClient()
const CAST = [
  { name: 'Deniz', code: '311111' },
  { name: 'Kerem', code: '322222' },
  { name: 'Selin', code: '333333' },
]
// clean slate, but through the database only because this is setup, not the test
await api.from('meetings').delete().eq('title', 'Prova')
for (const c of CAST) await api.from('members').delete().eq('display_name', c.name)

const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()
const jsErrors = []

async function open(label) {
  const ctx = await personaContext(browser, label, { viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => jsErrors.push(`${label}: ${e.message.slice(0, 140)}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text())) {
      jsErrors.push(`${label}: ${m.text().slice(0, 140)}`)
    }
  })
  page.on('response', async (r) => {
    if (r.status() < 400) return
    let why = ''
    try { why = (await r.text()).slice(0, 140) } catch { /* body gone */ }
    jsErrors.push(`${label}: ${r.status()} ${r.url().split('?')[0].replace(/^https?:\/\/[^/]+/, '')} ${why}`)
  })
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await settle(page)
  page.__ctx = ctx
  page.__persona = label
  return page
}
async function settle(pg, ms = 1200) {
  await pg
    .waitForFunction(() => !/Yükleniyor/.test(document.body.textContent ?? ''), null, { timeout: 25000 })
    .catch(() => {})
  await pg.waitForTimeout(ms)
  const welcome = pg.getByRole('button', { name: 'Hadi başlayalım' })
  if (await welcome.count()) { await welcome.click(); await pg.waitForTimeout(500) }
}
const go = async (pg, path) => {
  await pg.goto(APP + '#' + path, { waitUntil: 'domcontentloaded' })
  await settle(pg)
}
const shot = async (pg, name) => {
  if (!SHOTS) return
  await pg.screenshot({ path: `${SHOTS}/r${String(++step).padStart(2, '0')}-${name}.png`, fullPage: true })
}
const text = async (pg) => ((await pg.locator('body').textContent()) ?? '').replace(/\s+/g, ' ')

async function login(pg, name, code) {
  const nameBox = pg.getByPlaceholder('örn. Enes')
  if (!(await nameBox.count())) return true // already in
  await nameBox.fill(name)
  const boxes = pg.locator('input[inputmode="numeric"]')
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i])
  await pg.waitForTimeout(4500)
  const avatars = pg.locator('button').filter({ hasText: /^[\p{Emoji}]/u })
  if (await avatars.count()) { await avatars.nth(step % 20).click().catch(() => {}); await pg.waitForTimeout(900) }
  const skip = pg.getByRole('button', { name: 'Şimdilik geç' })
  if (await skip.count()) { await skip.click(); await pg.waitForTimeout(900) }
  await settle(pg)
  const t = await text(pg)
  if (/Otobüse binin/.test(t)) { bad('giriş', `${name} could not get in`); return false }
  return true
}

// =====================================================================
console.log('\n════ 1. ŞOFÖR GİRİYOR ════')
const host = await open('host')
if (!(await login(host, 'Enes', HOST_CODE))) process.exit(1)
ok('host signed in')
await shot(host, 'host-in')

// =====================================================================
console.log('\n════ 2. YOLCULARI EKLE (tamamen arayüzden) ════')
await go(host, '/host/uyeler')
for (const c of CAST) {
  const nameField = host.getByPlaceholder('Ad')
  if (!(await nameField.count())) { bad('yolcular', 'no "add passenger" field'); break }
  await nameField.fill(c.name)
  const addBtn = host.getByRole('button', { name: 'Yolcu ekle' })
  if (!(await addBtn.isEnabled())) { bad('yolcular', `"Yolcu ekle" stayed disabled for ${c.name}`); break }
  await addBtn.click()
  await host.waitForTimeout(1400)
  // now give them a code, which is what actually lets them in
  const row = host.locator('section > div, .card').filter({ hasText: c.name }).first()
  const setCode = row.getByRole('button', { name: /Kod ata|Kodu değiştir/ })
  if (!(await setCode.count())) { bad('yolcular', `no code button for ${c.name}`); continue }
  await setCode.click()
  await host.waitForTimeout(400)
  const codeBox = host.locator('input[inputmode="numeric"]').first()
  if (!(await codeBox.count())) { bad('yolcular', `no code field for ${c.name}`); continue }
  await codeBox.fill(c.code)
  await host.getByRole('button', { name: /^Kaydet$/ }).first().click()
  await host.waitForTimeout(1200)
}
const roster = (await api.from('members').select('display_name, code_set')).data ?? []
const added = CAST.filter((c) => roster.some((r) => r.display_name === c.name))
if (added.length !== CAST.length) bad('yolcular', `only ${added.length}/${CAST.length} passengers exist`)
else ok(`${added.length} passengers added through the UI`)
const coded = roster.filter((r) => CAST.some((c) => c.name === r.display_name) && r.code_set)
if (coded.length !== CAST.length) bad('yolcular', `only ${coded.length}/${CAST.length} got a code`)
else ok('all of them have a code')
await shot(host, 'roster')

// =====================================================================
console.log('\n════ 3. ÖNCEKİ TOPLANTIYI KAPAT, YENİSİNİ KUR ════')
await go(host, '/host')

// A host who has done a dry run must be able to start a clean night. This used
// to be impossible from the UI at all.
// keep archiving until the console offers a fresh start — a host who has run
// several dry runs must not have to press this an unknown number of times
let archived = 0
for (let i = 0; i < 6; i++) {
  const endBtn = host.getByRole('button', { name: /Bitir ve arşivle/ })
  if (!(await endBtn.count())) break
  await endBtn.click(); await host.waitForTimeout(400)
  await host.getByRole('button', { name: /Emin misin/ }).click()
  await host.waitForTimeout(1800)
  await settle(host)
  archived++
}
if (archived > 1) bad('konsol', `${archived} meetings were live at once — the host can only see one`)
else if (archived === 1) ok('archived the previous meeting from the console')
else note('no live meeting to archive — starting fresh')

const titleBox = host.getByPlaceholder(/örn\. 2026/)
if (!(await titleBox.count())) {
  bad('konsol', 'after archiving there is still no way to create a meeting')
} else {
  await titleBox.fill('Prova')
  await host.getByRole('button', { name: 'Yayına al' }).click()
  await host.waitForTimeout(2200)
  await settle(host)
  ok('created a fresh meeting through the UI')
}

// Building the route is now the thing an empty console lands on, rather than a
// link inside a picker the host has to open first.
const seedBtn = host.getByRole('button', { name: 'Hazır rotayı kur' })
if (!(await seedBtn.count())) {
  bad('konsol', 'an empty route does not offer to build the standard one')
} else {
  await seedBtn.click()
  await host.waitForTimeout(2800)
  ok('built the whole run of show in one press')
}

// and the picker itself must still be reachable and searchable
await go(host, '/host')
const addMore = host.getByRole('button', { name: /Durak ekle/ })
if (!(await addMore.count())) {
  note('no "add a stop" button once the route exists')
} else {
  await addMore.click()
  await host.waitForTimeout(700)
  const search = host.getByPlaceholder('Durak ara…')
  if (!(await search.count())) bad('konsol', 'the stop picker has no search')
  else {
    await search.fill('yalan')
    await host.waitForTimeout(600)
    const hits = await host.locator('section h3').count()
    if (!hits) bad('konsol', 'searching the stop picker returns nothing for a real word')
    else ok('the stop picker filters')
    const close = host.getByRole('button', { name: 'Kapat', exact: true })
    if (await close.count()) { await close.click(); await host.waitForTimeout(400) }
  }
}
await settle(host)
const { data: meetings } = await api.from('meetings').select('id, title, status')
  .eq('status', 'live').order('created_at', { ascending: false })
const meeting = (meetings ?? [])[0]
if (!meeting) bad('konsol', 'no live meeting exists after setup')
const { data: builtStages } = meeting
  ? await api.from('stages').select('id, kind, title, order_index, state').eq('meeting_id', meeting.id).order('order_index')
  : { data: [] }
if (!(builtStages ?? []).length) bad('konsol', 'the agenda is empty after building it')
else ok(`${builtStages.length} stops on the route`)
await shot(host, 'console-built')

// =====================================================================
console.log('\n════ 4. YOLCULAR BİNİYOR ════')
const players = []
for (const c of CAST) {
  const pg = await open(c.name)
  if (await login(pg, c.name, c.code)) {
    players.push({ pg, ...c })
  }
}
if (players.length !== CAST.length) bad('giriş', `${players.length}/${CAST.length} passengers got in`)
else ok('everyone is on the bus')
for (const p of players) {
  const t = await text(p.pg)
  if (/Otobüs kalkmak üzere|rotayı ayarlıyor/.test(t)) ok(`${p.name} sees the waiting screen`)
  else note(`${p.name} landed on: "${t.slice(0, 90)}"`)
}
await shot(players[0]?.pg ?? host, 'passenger-waiting')

// =====================================================================
console.log('\n════ 5. HER DURAĞI GERÇEKTEN OYNA ════')
// Walk the route the way the night actually goes: open the stop, let the room
// DO the thing, then move on. Pressing the primary button repeatedly races
// past the part where people participate, which is the part that matters.
// what each kind of screen wants typed into it
const SAMPLE = {
  wordcloud: 'dayanışma',
  board: 'Birbirimize güvenmemiz her şeyi kolaylaştırdı',
  suggestions: 'Cuma öğleden sonra toplantısız olsun',
  lean_coffee: 'Deploy sürecini konuşalım',
  feedback_wall: 'Zor bir dönemde hep sakin kaldın, bu bize çok iyi geldi',
  two_truths: 'Bir keresinde üç gün üst üste aynı tişörtü giydim',
}
/**
 * Whatever the host must do to make a stop playable, done through the UI.
 * A stop that cannot be made playable by clicking is the defect this whole
 * rehearsal exists to find.
 */
async function hostSetup(stage) {
  const k = stage.kind
  if (!['quiz', 'fibbage', 'wavelength', 'codenames', 'secret_mission', 'rank'].includes(k)) return
  await go(host, '/oda')
  const w = host.locator('.stage-world')

  if (k === 'fibbage') {
    const det = host.getByText('Yeni tur ekle')
    if (await det.count()) { await det.first().click(); await host.waitForTimeout(400) }
    const prompt = host.getByPlaceholder(/Soru…/)
    if (!(await prompt.count())) { bad('kurulum:fibbage', 'host cannot add a round from the stage'); return }
    await prompt.first().fill('Enes ilk maaşıyla ne aldı?')
    await host.getByPlaceholder('Gerçek cevap').fill('İkinci el bir gitar')
    await host.getByRole('button', { name: 'Ekle ve başlat' }).click()
    await host.waitForTimeout(2000)
  }

  if (k === 'wavelength') {
    const auto = host.getByRole('button', { name: /Takımları otomatik kur/ })
    if (await auto.count()) { await auto.click(); await host.waitForTimeout(1800); await go(host, '/oda') }
    const sel = host.locator('select').last()
    if (await sel.count()) {
      const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean))
      if (opts.length) { await sel.selectOption(opts[0]); await host.waitForTimeout(400) }
    }
    const start = host.getByRole('button', { name: 'Yeni tur' })
    if (!(await start.count()) || !(await start.isEnabled())) {
      bad('kurulum:wavelength', 'host cannot start a round')
      return
    }
    await start.click(); await host.waitForTimeout(2000)
  }

  if (k === 'codenames') {
    const mk = host.getByRole('button', { name: /Yeni oyun kur/ })
    if (await mk.count()) { await mk.click(); await host.waitForTimeout(2200); await go(host, '/oda') }
    // four seats: two spymasters, two operatives — one of them the host
    // both teams need a spymaster AND an operative; with fewer browsers than
    // seats the deal is correctly refused, so say so rather than crashing
    const seatPlan = [
      [host, 'Kırmızı', true],
      [players[0]?.pg, 'Kırmızı', false],
      [players[1]?.pg, 'Mavi', true],
      [players[2]?.pg, 'Mavi', false],
    ]
    const seats = seatPlan.filter(([pg]) => !!pg)
    if (seats.length < 4) {
      note(`codenames needs four seats and only ${seats.length} people are here — skipping`)
      return
    }
    for (const [pg, team, spy] of seats) {
      await go(pg, '/oda')
      const card = pg.locator('section.card', { hasText: team }).first()
      const b = card.getByRole('button', { name: spy ? /Spymaster/ : /Operatör/ })
      if (await b.count()) { await b.first().click(); await pg.waitForTimeout(1000) }
    }
    await go(host, '/oda')
    const deal = host.getByRole('button', { name: /Tahtayı dağıt/ })
    if (!(await deal.count())) { bad('kurulum:codenames', 'no deal button after seating four players'); return }
    if (!(await deal.isEnabled())) { bad('kurulum:codenames', 'deal stayed disabled with both roles filled'); return }
    await deal.click(); await host.waitForTimeout(2500)
  }

  if (k === 'secret_mission') {
    const assign = host.getByRole('button', { name: /Görevleri dağıt|Dağıt/ })
    if (!(await assign.count())) { bad('kurulum:secret_mission', 'host cannot hand out missions'); return }
    await assign.first().click(); await host.waitForTimeout(1800)
  }

  if (k === 'rank') {
    const box = host.getByPlaceholder(/öğe|Öğe/)
    if (!(await box.count())) { bad('kurulum:rank', 'host cannot add items to rank'); return }
    for (const item of ['Cuma deploy', 'Pazartesi toplantısı', 'Açık ofis']) {
      await box.first().fill(item)
      const add = host.getByRole('button', { name: /^Ekle$/ }).first()
      if (await add.count()) { await add.click(); await host.waitForTimeout(900) }
    }
  }

  if (k === 'quiz') {
    // the quiz is set up in the console panel, not on the stage
    await go(host, '/host')
    const openPanel = host.getByText(/Durak ayarları/)
    if (await openPanel.count()) { await openPanel.first().click(); await host.waitForTimeout(600) }
    // the composer lives inside collapsed <details>; a host would click them
    // open one by one, which is worth knowing but not worth failing over
    await host.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)))
    await host.waitForTimeout(500)
    const pack = host.getByRole('button', { name: /genel kültür/ }).first()
    if (!(await pack.count())) { bad('kurulum:quiz', 'no question pack in the console'); return }
    await pack.click()
    await host.waitForTimeout(2200)
    // and open the first one, which is what actually puts it in front of the room
    await go(host, '/oda')
    // the question list shows the question text now, with a plain "Aç" per row,
    // instead of pills labelled "1. aç"
    const openQ = host.getByRole('button', { name: 'Aç', exact: true })
    if (!(await openQ.count())) { bad('kurulum:quiz', 'host cannot open a question from the stage'); return }
    await openQ.first().click()
    await host.waitForTimeout(1800)
  }
}

/** How many rows the host's setup should have created, or null if not applicable. */
async function produced(stage) {
  const id = stage.id
  const count = async (table, col = 'stage_id', val = id) =>
    ((await api.from(table).select('id').eq(col, val)).data ?? []).length
  switch (stage.kind) {
    case 'quiz': return await count('quiz_questions')
    case 'fibbage': return await count('fibbage_rounds')
    case 'rank': return await count('rank_items')
    case 'codenames': return await count('cn_games')
    case 'wavelength': return await count('wave_rounds')
    // missions are RLS-private: the host can only ever see their own, so a row
    // count here would measure secrecy, not setup
    case 'secret_mission': return null
    default: return null
  }
}

/** Take each game far enough that it actually awards points. */
async function playToFinish(stage) {
  const k = stage.kind
  if (k === 'quiz') {
    for (const pl of players) {
      await go(pl.pg, '/oda')
      const choice = pl.pg.locator('.stage-world button').filter({ hasText: /^[A-DÇĞİÖŞÜ]?[).]?\s*\S/ })
      const opts = pl.pg.locator('section.card button:not([disabled])')
      if (await opts.count()) { await opts.first().click(); await pl.pg.waitForTimeout(900) }
    }
    await go(host, '/oda')
    const rev = host.getByRole('button', { name: /Cevabı aç|Aç ve puanla|Sonucu aç/ }).first()
    if (await rev.count()) { await rev.click(); await host.waitForTimeout(1800) }
    else note('quiz: no reveal button for the host')
  }
  if (k === 'fibbage') {
    for (const pl of players) {
      await go(pl.pg, '/oda')
      const box = pl.pg.getByPlaceholder(/İnandırıcı bir yalan/)
      if (await box.count()) {
        await box.fill(`${pl.name} uydurdu`)
        const g = pl.pg.getByRole('button', { name: /^Gönder$/ }).first()
        if (await g.count()) { await g.click(); await pl.pg.waitForTimeout(1000) }
      }
    }
    await go(host, '/oda')
    const toGuess = host.getByRole('button', { name: /Tahmine geç/ })
    if (await toGuess.count()) { await toGuess.click(); await host.waitForTimeout(1800) }
    for (const pl of players) {
      await go(pl.pg, '/oda')
      const opts = pl.pg.locator('.stage-world button:not([disabled])')
      const n = await opts.count()
      for (let j = 0; j < n; j++) {
        const label = ((await opts.nth(j).textContent()) ?? '').trim()
        if (label && !/Gönder|Çıkış|Oda|Kurallar|Profil|Tanı/.test(label)) {
          await opts.nth(j).click(); await pl.pg.waitForTimeout(900); break
        }
      }
    }
    await go(host, '/oda')
    const revFib = host.getByRole('button', { name: /Gerçeği aç/ })
    if (await revFib.count()) { await revFib.click(); await host.waitForTimeout(1800) }
  }
  if (k === 'rank') {
    for (const pl of players) {
      await go(pl.pg, '/oda')
      const sub = pl.pg.getByRole('button', { name: 'Sıralamamı gönder' })
      if (await sub.count()) { await sub.click(); await pl.pg.waitForTimeout(1000) }
    }
    await go(host, '/oda')
    const revRank = host.getByRole('button', { name: /Sonuçları aç ve puanla/ })
    if (await revRank.count()) { await revRank.click(); await host.waitForTimeout(1800) }
  }
}

const played = []
for (let i = 0; i < (builtStages ?? []).length; i++) {
  const stage = builtStages[i]
  await go(host, '/host')

  // 1. make it the active stop — via that row's own jump button
  const { data: mNow } = await api.from('meetings').select('active_stage_id').eq('id', meeting.id).single()
  if (mNow?.active_stage_id !== stage.id) {
    const row = host
      .locator('div.rounded-2xl')
      .filter({ hasText: `${i + 1}. ${stage.title}` })
      .last()
    const jump = row.getByRole('button', { name: 'Bu durağa geç' })
    if (await jump.count()) { await jump.first().click(); await host.waitForTimeout(1900) }
    else note(`stop ${i + 1} (${stage.kind}) has no jump button`)
  }
  const { data: m1 } = await api.from('meetings').select('active_stage_id').eq('id', meeting.id).single()
  if (m1?.active_stage_id !== stage.id) { note(`could not reach stop ${i + 1} (${stage.kind})`); continue }

  // 2. open it if it is still pending
  let { data: st1 } = await api.from('stages').select('state').eq('id', stage.id).single()
  if (st1?.state === 'pending') {
    await go(host, '/host')
    const openBtn = host.locator('button').filter({ hasText: /Durağı aç/ }).first()
    if (await openBtn.count()) { await openBtn.click(); await host.waitForTimeout(1800) }
  }
  st1 = (await api.from('stages').select('state').eq('id', stage.id).single()).data

  // 2b. the host sets the stop up, from wherever the app expects them to
  await hostSetup(stage)

  // 2c. did the setup actually produce anything?
  const made = await produced(stage)
  if (made !== null) {
    if (made === 0) bad(`kurulum:${stage.kind}`, 'the host setup produced nothing at all')
    else ok(`${stage.kind}: host setup produced ${made} row(s)`)
  }

  // 3. now: what can a passenger actually DO here?
  const p = players[0]
  await go(p.pg, '/oda')
  const body = await text(p.pg)
  const live = p.pg.locator('.stage-world')
  const inputs = await live.locator('input:not([disabled]), textarea:not([disabled])').count()
  const buttons = await live.locator('button:not([disabled])').count()
  const told =
    // a break, and a secret mission, are meant to be read rather than acted on
    stage.kind === 'break' ||
    stage.kind === 'secret_mission' ||
    // Deliberately not keyed on a role name: this used to look for "Şoför",
    // so retiring that persona from the copy made every waiting screen look
    // like a dead end to the test.
    /bekl|düşünüyor|hazırlan|toplanıyor|gizli|açıldığında|sıran değil|kurulmadı|yazılmamış|Mola/i.test(body)

  // No raw identifiers on a Turkish screen. Snake-case stage kinds and the
  // English dimension keys are internal names; seeing one means a label lookup
  // is missing, which is exactly what made the yearbook print "teamwork".
  const RAW = [
    'wordcloud', 'two_truths', 'health_check', 'lean_coffee', 'feedback_wall',
    'secret_mission', 'codenames', 'wavelength', 'leaderboard', 'suggestions',
    'teamwork', 'learning', 'support', 'mission',
  ]
  const leaked = RAW.filter((r) => new RegExp(`(^|[^a-zçğıöşü])${r}([^a-zçğıöşü]|$)`, 'i').test(body))
  if (leaked.length) bad(`sızıntı:${stage.kind}`, `raw identifiers on screen: ${leaked.join(', ')}`)

  played.push({ kind: stage.kind, state: st1?.state, inputs, buttons, told })
  if (inputs === 0 && buttons === 0 && !told) {
    bad(`durak:${stage.kind}`, `state=${st1?.state}: nothing to do and no explanation — "${body.slice(120, 260)}"`)
    await shot(p.pg, `stuck-${stage.kind}`)
  } else if (inputs === 0 && buttons === 0) {
    note(`${stage.kind}: passenger waits (told so) at state=${st1?.state}`)
  } else {
    ok(`${stage.kind}: ${inputs} field(s), ${buttons} button(s) for the room`)
  }

  // 4a. games must be played to a finish, or the leaderboard is all zeros
  await playToFinish(stage)

  // 4. everyone actually takes part, so the night produces real content
  for (const pl of players) {
    await go(pl.pg, '/oda')
    const w = pl.pg.locator('.stage-world')
    const ta = w.locator('textarea:not([disabled])').first()
    const inp = w.locator('input[type="text"]:not([disabled]), input:not([type]):not([disabled])').first()
    const field = (await ta.count()) ? ta : (await inp.count()) ? inp : null
    if (field) {
      await field.fill(SAMPLE[stage.kind] ?? `${pl.name} — deneme`)
      const send = w
        .getByRole('button', { name: /^(Ekle|Gönder|Kaydet|＋ .+)$/ })
        .first()
      if ((await send.count()) && (await send.isEnabled())) {
        await send.click()
        await pl.pg.waitForTimeout(1100)
      } else if (['board', 'lean_coffee', 'suggestions', 'wordcloud'].includes(stage.kind)) {
        // only the writing stages must always offer a way to submit; a game's
        // clue box belongs to one person and is expected to be inert for others
        bad(`yazma:${stage.kind}`, 'there is a field but no enabled way to submit what you typed')
      }
    } else if (stage.kind === 'health_check') {
      const opts = w.getByRole('button', { name: /İyi|Orta|Kötü/ })
      const n = Math.min(await opts.count(), 6)
      for (let k = 0; k < n; k++) { await opts.nth(k * 3).click().catch(() => {}); await pl.pg.waitForTimeout(250) }
    }
  }
}
ok(`played ${played.length} stops`)

// =====================================================================
console.log('\n════ 6. GECE NE ÜRETTİ ════')
// The point of the whole evening: it has to leave something behind.
const { data: cards } = await api.from('cards').select('id, stage_id').in(
  'stage_id', (builtStages ?? []).map((x) => x.id),
)
if (!(cards ?? []).length) bad('içerik', 'the meeting produced no cards at all')
else {
  const byKind = {}
  for (const st of builtStages ?? []) {
    const n = (cards ?? []).filter((c) => c.stage_id === st.id).length
    if (n) byKind[st.kind] = (byKind[st.kind] ?? 0) + n
  }
  ok(`${cards.length} cards written: ${Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join(', ')}`)
}

const { data: scores } = await api.from('scores').select('points').eq('meeting_id', meeting.id)
const total = (scores ?? []).reduce((a, b) => a + b.points, 0)
if (!(scores ?? []).length) note('no points were scored (games were set up but not played to a finish)')
else ok(`${scores.length} score rows, ${total} points total`)

await go(host, '/yillik')
const yb = await text(host)
if (!/Retro Yıllığı/.test(yb)) bad('yıllık', 'the yearbook did not render')
else ok('yearbook renders')
const YB_RAW = ['teamwork', 'learning', 'wordcloud', 'health_check', 'lean_coffee', 'feedback_wall']
const ybLeak = YB_RAW.filter((r) => new RegExp(`(^|[^a-zçğıöşü])${r}([^a-zçğıöşü]|$)`, 'i').test(yb))
if (ybLeak.length) bad('yıllık', `raw identifiers in the keepsake: ${ybLeak.join(', ')}`)
else ok('no raw identifiers in the yearbook')
if (!/Bu otobüsteydik/.test(yb)) bad('yıllık', 'the yearbook has nobody in it')
else ok('everyone is in the yearbook')
for (const c of CAST) {
  if (!yb.includes(c.name)) bad('yıllık', `${c.name} is missing from the yearbook`)
}
// the actual words people wrote must survive into the keepsake
const sampleWords = ['güvenmemiz', 'dayanışma', 'toplantısız', 'Deploy']
const missing = sampleWords.filter((wd) => !yb.includes(wd))
if (missing.length) {
  bad('yıllık', `content written during the meeting is missing from the keepsake: ${missing.join(', ')}`)
} else ok('every kind of written content reached the yearbook')
await shot(host, 'yearbook')

// ---------------------------------------------------------------- report
console.log('\n════════════ PROVA RAPORU ════════════')
if (jsErrors.length) {
  const uniq = [...new Set(jsErrors)]
  for (const e of uniq.slice(0, 12)) bad('js', e)
  if (uniq.length > 12) note(`…and ${uniq.length - 12} more browser errors`)
} else ok('no browser errors anywhere in the rehearsal')

console.log(`\nproblems: ${problems.length}`)
problems.forEach((p) => console.log('  ' + p))
if (notes.length) {
  console.log(`\nnotes: ${notes.length}`)
  notes.forEach((n) => console.log('  ' + n))
}

if (meeting) await api.from('meetings').delete().eq('id', meeting.id)
for (const c of CAST) await api.from('members').delete().eq('display_name', c.name)
await saveAllSessions()
await browser.close()
await server.close()
process.exit(problems.length ? 1 : 0)
