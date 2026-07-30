// Debug probe: put a stage in a specific state and dump what each player
// actually sees — visible text, inputs, buttons. Used to tell a broken app
// apart from a broken test.
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { hostClient } from './_clients.mjs'

const PORT = 4241
const APP = `http://localhost:${PORT}/retrobus/`
const SHOTS = process.env.SHOT_DIR ?? '/tmp'
const api = await hostClient()
const NAMES = ['Probe1', 'Probe2', 'Probe3']
const CODES = ['911111', '922222', '933333']

await api.from('meetings').delete().eq('title', 'Probe')
for (const n of NAMES) {
  await api.from('members').delete().eq('display_name', n)
  await api.from('members').insert({ display_name: n })
}
const { data: roster } = await api.from('members').select('id, display_name')
const idOf = (n) => roster.find((r) => r.display_name === n)?.id
for (let i = 0; i < NAMES.length; i++) {
  await api.rpc('set_member_code', { p_member_id: idOf(NAMES[i]), p_code: CODES[i] })
}
const { data: meeting } = await api.from('meetings').insert({ title: 'Probe', status: 'live' }).select().single()

const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()
async function login(name, code) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'tr-TR' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`  !! ${name} JS: ${e.message.slice(0, 140)}`))
  await page.goto(APP, { waitUntil: 'networkidle' })
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
const room = async (pg) => {
  await pg.goto(APP + '#/oda', { waitUntil: 'networkidle' })
  await pg.reload({ waitUntil: 'networkidle' })
  await pg.waitForTimeout(2200)
}
async function dump(pg, who) {
  const info = await pg.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    return {
      title: document.querySelector('h2')?.textContent?.trim() ?? '(no h2)',
      phase: [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /aşama|sıra|bekl/i.test(e.textContent ?? '')).slice(0, 3).map((e) => e.textContent.trim().slice(0, 70)),
      inputs: [...document.querySelectorAll('input,textarea,select')].filter(vis).map((e) => `${e.tagName.toLowerCase()}[${e.type ?? ''}] ph="${e.placeholder ?? ''}"`),
      buttons: [...document.querySelectorAll('button')].filter(vis).map((b) => `${b.disabled ? '(off) ' : ''}${(b.textContent ?? '').trim().slice(0, 40)}`).slice(0, 22),
      body: (document.querySelector('.stage-world')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 420),
    }
  })
  console.log(`\n--- ${who} ---`)
  console.log(`  title: ${info.title}`)
  console.log(`  inputs: ${info.inputs.join(' | ') || '(none)'}`)
  console.log(`  buttons: ${info.buttons.join(' · ') || '(none)'}`)
  console.log(`  text: ${info.body}`)
  await pg.screenshot({ path: `${SHOTS}/probe-${who}.png` })
}

const host = await login('Enes', process.env.RETROBUS_HOST_CODE ?? '424242')
const p1 = await login(NAMES[0], CODES[0])
const p2 = await login(NAMES[1], CODES[1])
const p3 = await login(NAMES[2], CODES[2])

let order = 0
const addStage = async (kind, title, config = {}) =>
  (await api.from('stages').insert({ meeting_id: meeting.id, kind, title, order_index: ++order, config }).select().single()).data
const activate = async (st) => {
  await api.from('meetings').update({ active_stage_id: st.id }).eq('id', meeting.id)
  await api.from('stages').update({ state: 'open' }).eq('id', st.id)
}

// ---------------- WAVELENGTH ----------------
console.log('\n======== WAVELENGTH ========')
const w = await addStage('wavelength', 'Frekans')
await activate(w)
await room(host)
const auto = host.getByRole('button', { name: /Takımları otomatik kur/ })
if (await auto.count()) { await auto.click(); await host.waitForTimeout(2000) }
await dump(host, 'wave-host-before')
const cfg = (await api.from('stages').select('config').eq('id', w.id).single()).data.config
console.log('  teams:', JSON.stringify(cfg.teams))
console.log('  names:', Object.entries(cfg.teams ?? {}).map(([id, t]) => `${roster.find((r) => r.id === id)?.display_name}=${t}`).join(' '))
// start a round via the UI exactly as a host would
const sel = host.locator('select').last()
const opts = await sel.locator('option').evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })))
console.log('  psychic options:', opts.length)
const pick = opts.find((o) => /Probe1/.test(o.t))
console.log('  picking:', pick?.t)
await sel.selectOption(pick.v)
await host.waitForTimeout(500)
const startBtn = host.getByRole('button', { name: 'Yeni tur' })
console.log('  start enabled after pick:', await startBtn.isEnabled())
await startBtn.click(); await host.waitForTimeout(2200)
const rd = (await api.from('wave_rounds').select('*').eq('stage_id', w.id).order('order_index')).data?.at(-1)
console.log('  round:', rd ? `phase=${rd.phase} psychic=${roster.find((r) => r.id === rd.psychic_member_id)?.display_name} active=${rd.active_team}` : 'NONE')
if (rd) {
  const pgFor = (id) => ({ [idOf(NAMES[0])]: [p1, NAMES[0]], [idOf(NAMES[1])]: [p2, NAMES[1]], [idOf(NAMES[2])]: [p3, NAMES[2]] })[id] ?? [host, 'Enes']
  const [psy, psyName] = pgFor(rd.psychic_member_id)
  await room(psy); await dump(psy, `wave-psychic-${psyName}`)
  const other = psy === p1 ? p2 : p1
  await room(other); await dump(other, 'wave-other')
}

// ---------------- FIBBAGE ----------------
console.log('\n======== FIBBAGE ========')
const f = await addStage('fibbage', 'Fibbage')
await activate(f)
await room(host)
await dump(host, 'fib-host-empty')
const det = host.getByText('Yeni tur ekle')
if (await det.count()) { await det.first().click(); await host.waitForTimeout(400) }
const pr = host.getByPlaceholder('Soru…')
console.log('  prompt input:', await pr.count())
if (await pr.count()) {
  await pr.first().fill('Enes ilk hangi işte çalıştı?')
  await host.getByPlaceholder('Gerçek cevap').fill('Çağrı merkezi')
  await host.getByRole('button', { name: 'Ekle ve başlat' }).click()
  await host.waitForTimeout(2200)
}
const fr = (await api.from('fibbage_rounds').select('*').eq('stage_id', f.id)).data
console.log('  rounds:', JSON.stringify((fr ?? []).map((r) => ({ ph: r.phase, p: r.prompt?.slice(0, 20) }))))
await room(p1); await dump(p1, 'fib-player')
await room(host); await dump(host, 'fib-host-after')

// ---------------- TWO TRUTHS ----------------
console.log('\n======== TWO TRUTHS ========')
const t = await addStage('two_truths', 'İki Doğru')
await activate(t)
for (const [pg, who] of [[p1, 'a'], [p2, 'b']]) {
  await room(pg)
  const ins = pg.locator('input.input-blob')
  if ((await ins.count()) >= 3) {
    for (let i = 0; i < 3; i++) await ins.nth(i).fill(`${who} cümle ${i + 1}`)
    const lb = pg.getByRole('button', { name: '2. cümle yalan' })
    if (await lb.count()) await lb.click()
    await pg.getByRole('button', { name: /^Gönder$/ }).click()
    await pg.waitForTimeout(1400)
  }
}
console.log('  entries:', ((await api.from('two_truths_entries').select('id').eq('stage_id', t.id)).data ?? []).length)
await room(host); await dump(host, 'tt-host')
await room(p3); await dump(p3, 'tt-player-nosubmit')

await api.from('meetings').delete().eq('id', meeting.id)
for (const n of NAMES) await api.from('members').delete().eq('display_name', n)
await browser.close()
await server.close()
