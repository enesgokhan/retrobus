// TEN PEOPLE, WHICH IS THE ACTUAL SIZE OF THE NIGHT.
//
// Everything so far was proven with two to four browsers. The real evening has
// nine or ten, and several things only go wrong at that size: a board with
// thirty cards instead of three, presence counts, the host's readiness numbers,
// team splits that must not leave anyone out, and screens that were designed
// while looking at a list of four names.
//
// This is deliberately heavier than the other suites; it is meant to be run
// before the night, not on every change.
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { hostClient } from './_clients.mjs'
import { personaContext, rememberSession } from './_browser.mjs'

const PORT = 4266
const APP = `http://localhost:${PORT}/retrobus/`
const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'
const SHOTS = process.env.SHOT_DIR ?? null

const problems = []
const notes = []
const bad = (w, m) => { problems.push(`[${w}] ${m}`); console.log(`  ✗ ${w}: ${m}`) }
const ok = (m) => console.log(`  ✓ ${m}`)
const note = (m) => { notes.push(m); console.log(`  · ${m}`) }

const api = await hostClient()
const CAST = ['Deniz', 'Kerem', 'Selin', 'Umut', 'Ece', 'Barış', 'Naz', 'Efe', 'Melis']
  .map((name, i) => ({ name, code: `10${String(i).padStart(4, '0')}` }))

console.log(`kurulum: ${CAST.length} yolcu + şoför`)
await api.from('meetings').delete().eq('title', 'KalabalıkGece')
for (const c of CAST) {
  await api.from('members').delete().eq('display_name', c.name)
  await api.from('members').insert({ display_name: c.name })
}
const { data: roster } = await api.from('members').select('id, display_name')
const idOf = (n) => roster.find((r) => r.display_name === n)?.id
for (const c of CAST) await api.rpc('set_member_code', { p_member_id: idOf(c.name), p_code: c.code })

await api.from('meetings').update({ status: 'done', active_stage_id: null }).eq('status', 'live')
const { data: meeting } = await api.from('meetings')
  .insert({ title: 'KalabalıkGece', status: 'live' }).select().single()
const mk = async (kind, title, config, order) =>
  (await api.from('stages').insert({ meeting_id: meeting.id, kind, title, order_index: order, config })
    .select().single()).data
const board = await mk('board', 'Neler İyi Gitti', { identity: 'anon', reveal: 'batch', dots: 3 }, 1)
const wave = await mk('wavelength', 'Frekans', {}, 2)
const cn = await mk('codenames', 'Kelime Ajanları', {}, 3)
const lb = await mk('leaderboard', 'Şampiyonluk Tablosu', {}, 4)

const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()
const jsErrors = []
async function open(label) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, locale: 'tr-TR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => jsErrors.push(`${label}: ${e.message.slice(0, 120)}`))
  page.on('response', async (r) => {
    if (r.status() < 400) return
    let why = ''
    try { why = (await r.text()).slice(0, 110) } catch { /* gone */ }
    jsErrors.push(`${label}: ${r.status()} ${r.url().split('?')[0].replace(/^https?:\/\/[^/]+/, '')} ${why}`)
  })
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await settle(page)
  page.__ctx = ctx
  page.__persona = label
  return page
}
async function settle(pg, ms = 900) {
  await pg.waitForFunction(() => !/Yükleniyor/.test(document.body.textContent ?? ''), null, { timeout: 30000 })
    .catch(() => {})
  await pg.waitForTimeout(ms)
  const w = pg.getByRole('button', { name: 'Hadi başlayalım' })
  if (await w.count()) { await w.click(); await pg.waitForTimeout(300) }
}
const go = async (pg, path) => {
  await pg.goto(APP + '#' + path, { waitUntil: 'domcontentloaded' })
  await settle(pg)
}
const text = async (pg) => ((await pg.locator('body').textContent()) ?? '').replace(/\s+/g, ' ')
const shot = async (pg, n) => { if (SHOTS) await pg.screenshot({ path: `${SHOTS}/t-${n}.png`, fullPage: true }) }
async function login(pg, name, code) {
  await pg.getByPlaceholder('örn. Enes').fill(name)
  const boxes = pg.locator('input[inputmode="numeric"]')
  for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i])
  await pg.waitForTimeout(4500)
  const skip = pg.getByRole('button', { name: 'Şimdilik geç' })
  if (await skip.count()) { await skip.click(); await pg.waitForTimeout(700) }
  await settle(pg)
  return !/Otobüse binin/.test(await text(pg))
}

const host = await open('host')
await login(host, 'Enes', HOST_CODE)
const t0 = Date.now()
const people = []
for (const c of CAST) {
  const pg = await open(c.name)
  if (await login(pg, c.name, c.code)) {
    people.push({ pg, ...c })
    await rememberSession(pg.__ctx, pg.__persona)
  } else bad('giriş', `${c.name} could not sign in`)
}
ok(`${people.length + 1} people signed in (${Math.round((Date.now() - t0) / 1000)}s)`)
const rateLimited = jsErrors.filter((e) => e.includes('over_request_rate_limit')).length
if (rateLimited) {
  note(
    `Supabase refused ${rateLimited} anonymous sign-in(s) with 429. The client now ` +
    'retries with backoff, so a burst usually still gets in — but if this happens ' +
    'on the night, raise the anonymous sign-in rate limit in the Supabase dashboard ' +
    '(Authentication → Rate Limits). Ten people opening one link at once is normal here.',
  )
}

// ---------------------------------------------------------------- presence
console.log('\n-- oda sayısı --')
await go(host, '/host')
{
  const t = await text(host)
  const m = /(\d+)\/(\d+) odada/.exec(t)
  if (!m) note('the console does not show a room count')
  else {
    const [, here, total] = m
    if (Number(total) < people.length + 1) bad('varlık', `roster says ${total}, expected at least ${people.length + 1}`)
    if (Number(here) < people.length) bad('varlık', `only ${here} of ${total} counted as present`)
    else ok(`console reads ${here}/${total} in the room`)
  }
  await shot(host, 'console-10')
}

// ---------------------------------------------------------------- big board
console.log('\n-- otuz kartlık pano --')
await api.from('meetings').update({ active_stage_id: board.id }).eq('id', meeting.id)
await api.from('stages').update({ state: 'open' }).eq('id', board.id)
await host.waitForTimeout(3500)
{
  const LINES = [
    'Deploy hattı sonunda güvenilir hale geldi, cuma günü bile korkmuyoruz',
    'Birbirimize soru sormak kolaylaştı',
    'Onboarding dokümanı gerçekten işe yaradı',
  ]
  let written = 0
  for (const p of people) {
    await go(p.pg, '/oda')
    for (const line of LINES) {
      const ta = p.pg.locator('textarea').first()
      if (!(await ta.count())) break
      await ta.fill(`${line} — ${p.name}`)
      const add = p.pg.getByRole('button', { name: /^(Ekle|＋ .+)$/ }).first()
      if (!(await add.count()) || !(await add.isEnabled())) break
      await add.click()
      await p.pg.waitForTimeout(500)
      written++
    }
  }
  const { data: cards } = await api.from('cards').select('id').eq('stage_id', board.id)
  ok(`${written} cards submitted, ${(cards ?? []).length} stored`)
  if ((cards ?? []).length < written) bad('pano', `${written - (cards ?? []).length} cards were lost`)

  // the host's progress counter must reflect the whole room, not what RLS shows
  await go(host, '/oda')
  const ht = await text(host)
  const prog = /(\d+)\/(\d+) yazdı/.exec(ht)
  if (prog && Number(prog[1]) !== people.length) {
    note(`host sees "${prog[0]}" while ${people.length} people wrote`)
  }

  // reveal it and look at what a 27-card board actually looks like
  await api.from('stages').update({ state: 'revealed' }).eq('id', board.id)
  await host.waitForTimeout(4000)
  await go(people[0].pg, '/oda')
  await shot(people[0].pg, 'board-27')
  const overflow = await people[0].pg.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 4,
  )
  if (overflow) bad('pano', 'a full board scrolls sideways')
  else ok('a full board does not overflow horizontally')

  // and everyone can still vote
  const voteBtns = people[0].pg.locator('.stage-world button[aria-label*="oy"]')
  const n = await voteBtns.count()
  if (!n) bad('pano', 'nobody can vote on the revealed board')
  else {
    await voteBtns.first().click()
    await people[0].pg.waitForTimeout(1200)
    const { data: votes } = await api.from('votes').select('id').eq('stage_id', board.id)
    if (!(votes ?? []).length) bad('pano', 'a vote did not register')
    else ok(`voting works on a ${(cards ?? []).length}-card board`)
  }
}

// ---------------------------------------------------------------- teams
console.log('\n-- on kişiyle takım kurmak --')
await api.from('meetings').update({ active_stage_id: wave.id }).eq('id', meeting.id)
await api.from('stages').update({ state: 'open' }).eq('id', wave.id)
await host.waitForTimeout(3000)
{
  await go(host, '/oda')
  const auto = host.getByRole('button', { name: /Takımları otomatik kur/ })
  if (!(await auto.count())) bad('frekans', 'no auto-team button with ten people')
  else {
    await auto.click()
    await host.waitForTimeout(2500)
    const { data: st } = await api.from('stages').select('config').eq('id', wave.id).single()
    const teams = st?.config?.teams ?? {}
    const a = Object.values(teams).filter((t) => t === 'a').length
    const b = Object.values(teams).filter((t) => t === 'b').length
    const assigned = a + b
    if (assigned < people.length + 1) {
      bad('frekans', `${people.length + 1 - assigned} people were left out of both teams`)
    } else if (Math.abs(a - b) > 1) {
      bad('frekans', `teams are lopsided: ${a} vs ${b}`)
    } else ok(`teams split ${a}/${b} with everyone included`)
  }
}

// ---------------------------------------------------------------- lobby
console.log('\n-- on kişilik codenames lobisi --')
await api.from('meetings').update({ active_stage_id: cn.id }).eq('id', meeting.id)
await api.from('stages').update({ state: 'open' }).eq('id', cn.id)
await host.waitForTimeout(3000)
{
  await go(host, '/oda')
  const mkGame = host.getByRole('button', { name: /Yeni oyun kur/ })
  if (await mkGame.count()) { await mkGame.click(); await host.waitForTimeout(2200) }
  // everyone piles into a seat, which is what will actually happen
  for (let i = 0; i < people.length; i++) {
    const p = people[i]
    await go(p.pg, '/oda')
    const team = i % 2 === 0 ? 'Kırmızı' : 'Mavi'
    const spy = i < 2 // first two take the spymaster chairs
    const card = p.pg.locator('section.card', { hasText: team }).first()
    const b = card.getByRole('button', { name: spy ? /Spymaster/ : /Operatör/ })
    if (await b.count()) { await b.first().click(); await p.pg.waitForTimeout(400) }
  }
  await go(host, '/oda')
  await shot(host, 'cn-lobby-10')
  const { data: pl } = await api.from('cn_players').select('member_id, team, is_spymaster')
  const red = (pl ?? []).filter((x) => x.team === 'red').length
  const blue = (pl ?? []).filter((x) => x.team === 'blue').length
  ok(`${(pl ?? []).length} seated (${red} red, ${blue} blue)`)
  const deal = host.getByRole('button', { name: /Tahtayı dağıt/ })
  if (!(await deal.count())) bad('ajanlar', 'no deal button with a full lobby')
  else if (!(await deal.isEnabled())) bad('ajanlar', 'the board cannot be dealt with nine people seated')
  else {
    await deal.click()
    await host.waitForTimeout(2500)
    const { data: g } = await api.from('cn_games').select('phase').eq('stage_id', cn.id).order('created_at', { ascending: false }).limit(1)
    if ((g ?? [])[0]?.phase !== 'playing') bad('ajanlar', 'the game did not start')
    else ok('the board deals with a full room')
  }
}

// ---------------------------------------------------------------- finale
console.log('\n-- on kişilik final tablosu --')
await api.from('meetings').update({ active_stage_id: lb.id }).eq('id', meeting.id)
await api.from('stages').update({ state: 'revealed' }).eq('id', lb.id)
await host.waitForTimeout(3000)
{
  await go(people[0].pg, '/oda')
  await people[0].pg.waitForTimeout(12000) // let the whole reveal play out
  await shot(people[0].pg, 'leaderboard-10')
  const t = await text(people[0].pg)
  const signedIn = people.map((p) => p.name)
  const named = signedIn.filter((n) => t.includes(n)).length
  if (named < signedIn.length) {
    bad('final', `only ${named}/${signedIn.length} of the people who signed in appear on the leaderboard`)
  } else ok(`everyone who signed in (${named}) appears on the final table`)
  const tall = await people[0].pg.evaluate(() => document.body.scrollHeight)
  note(`leaderboard page height with ten people: ${tall}px`)
}

console.log('\n════════════ RAPOR ════════════')
const realErrors = [...new Set(jsErrors)].filter((e) => !e.includes('over_request_rate_limit'))
if (realErrors.length) {
  for (const e of realErrors.slice(0, 10)) bad('js', e)
} else ok('no browser or network errors with ten people (rate limits reported separately)')
console.log(`\nproblems: ${problems.length}`)
problems.forEach((p) => console.log('  ' + p))
if (notes.length) { console.log(`\nnotes: ${notes.length}`); notes.forEach((n) => console.log('  ' + n)) }

await api.from('meetings').delete().eq('id', meeting.id)
for (const c of CAST) await api.from('members').delete().eq('display_name', c.name)
await browser.close()
await server.close()
process.exit(problems.length ? 1 : 0)
