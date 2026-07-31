// THE NETWORK ENES IS ACTUALLY ON.
//
// His work proxy refuses the WebSocket upgrade, which is how we found out that
// nothing on any screen had ever been updating live for him. The polling
// fallback exists for exactly this, and it is not an edge case — it is the path
// his own machine takes, and possibly some of his teammates' too.
//
// So: run a real slice of the meeting with WebSockets blocked outright and
// require that the room still follows the host, still sees reveals, and still
// gets its own writes back.
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { personaContext, saveAllSessions } from './_browser.mjs'
import { hostClient } from './_clients.mjs'

const PORT = 4264
const APP = `http://localhost:${PORT}/retrobus/`
const HOST_CODE = process.env.RETROBUS_HOST_CODE ?? '424242'

const problems = []
const bad = (w, m) => { problems.push(`[${w}] ${m}`); console.log(`  ✗ ${w}: ${m}`) }
const ok = (m) => console.log(`  ✓ ${m}`)
const note = (m) => console.log(`  · ${m}`)

const api = await hostClient()
const NAME = 'Proxy'
const CODE = '181818'
await api.from('meetings').delete().eq('title', 'ProxyGece')
await api.from('members').delete().eq('display_name', NAME)
await api.from('members').insert({ display_name: NAME })
const { data: roster } = await api.from('members').select('id, display_name')
await api.rpc('set_member_code', {
  p_member_id: roster.find((r) => r.display_name === NAME).id, p_code: CODE,
})
await api.from('meetings').update({ status: 'done', active_stage_id: null }).eq('status', 'live')
const { data: meeting } = await api.from('meetings')
  .insert({ title: 'ProxyGece', status: 'live' }).select().single()
const mk = async (kind, title, config, order) =>
  (await api.from('stages').insert({ meeting_id: meeting.id, kind, title, order_index: order, config })
    .select().single()).data
const board = await mk('board', 'Neler İyi Gitti', { identity: 'anon', reveal: 'batch', dots: 3 }, 1)
const second = await mk('wordcloud', 'Tek Kelimeyle', {}, 2)

const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()

// The whole point: this context can never open a WebSocket.
//
// context.route() does NOT intercept the WebSocket handshake — an earlier
// version of this test used it, saw the room follow the host in ~1s (socket
// speed, not the 4s polling cadence) and reported a pass for a path it had
// never actually exercised. Replacing window.WebSocket in the page is the
// honest way to reproduce a proxy that refuses the upgrade.
const ctx = await personaContext(browser, 'proxy', { viewport: { width: 1500, height: 950 } })
await ctx.addInitScript(() => {
  class DeadSocket extends EventTarget {
    constructor() {
      super()
      this.readyState = 3 // CLOSED
      setTimeout(() => {
        this.dispatchEvent(new Event('error'))
        this.dispatchEvent(new CloseEvent('close', { code: 1006, wasClean: false }))
        // supabase-js assigns handlers rather than adding listeners
        this.onerror?.(new Event('error'))
        this.onclose?.(new CloseEvent('close', { code: 1006, wasClean: false }))
      }, 5)
    }
    send() { throw new Error('blocked by proxy') }
    close() {}
  }
  DeadSocket.CONNECTING = 0
  DeadSocket.OPEN = 1
  DeadSocket.CLOSING = 2
  DeadSocket.CLOSED = 3
  Object.defineProperty(window, 'WebSocket', { value: DeadSocket, writable: false })
})
const pg = await ctx.newPage()
let socketAttempts = 0
pg.on('websocket', () => { socketAttempts++ })

const settle = async (ms = 1500) => {
  await pg.waitForFunction(() => !/Yükleniyor/.test(document.body.textContent ?? ''), null, { timeout: 25000 })
    .catch(() => {})
  await pg.waitForTimeout(ms)
  const w = pg.getByRole('button', { name: 'Hadi başlayalım' })
  if (await w.count()) { await w.click(); await pg.waitForTimeout(400) }
}
const text = async () => ((await pg.locator('body').textContent()) ?? '').replace(/\s+/g, ' ')
/** wait for something to appear WITHOUT reloading — the whole question here */
async function appears(rx, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (rx.test(await text())) return Math.round((Date.now() - t0) / 1000)
    await pg.waitForTimeout(800)
  }
  return null
}

await pg.goto(APP, { waitUntil: 'domcontentloaded' })
await settle()
await pg.getByPlaceholder('örn. Enes').fill(NAME)
const boxes = pg.locator('input[inputmode="numeric"]')
for (let i = 0; i < 6; i++) await boxes.nth(i).fill(CODE[i])
await pg.waitForTimeout(5000)
const skip = pg.getByRole('button', { name: 'Şimdilik geç' })
if (await skip.count()) { await skip.click(); await pg.waitForTimeout(900) }
await settle()
if (/Otobüse binin/.test(await text())) {
  bad('giriş', 'cannot even sign in without a WebSocket')
  process.exit(1)
}
ok('signed in with WebSockets blocked')

// ---------------------------------------------------------------- follow
console.log('\n-- şoför durağı açıyor, yolcu takip edebiliyor mu --')
await api.from('meetings').update({ active_stage_id: board.id }).eq('id', meeting.id)
await api.from('stages').update({ state: 'open' }).eq('id', board.id)
{
  const secs = await appears(/Neler İyi Gitti/)
  if (secs == null) bad('takip', 'the room never followed the host onto the stop (no socket, no polling)')
  else ok(`followed the host onto the stop in ~${secs}s`)
}

// ---------------------------------------------------------------- write
console.log('\n-- yazabiliyor mu, yazdığını görebiliyor mu --')
{
  const ta = pg.locator('textarea').first()
  if (!(await ta.count())) bad('yazma', 'no way to write with the socket blocked')
  else {
    await ta.fill('Proxy arkasından yazıldı')
    const add = pg.getByRole('button', { name: /^(Ekle|＋ .+)$/ }).first()
    if (await add.count()) { await add.click(); await pg.waitForTimeout(2000) }
    const { data: cards } = await api.from('cards').select('body').eq('stage_id', board.id)
    if (!(cards ?? []).some((c) => c.body.includes('Proxy'))) bad('yazma', 'the card never reached the database')
    else ok('writing works over plain HTTP')
  }
}

// ---------------------------------------------------------------- reveal
console.log('\n-- açılışı görebiliyor mu --')
await api.from('stages').update({ state: 'revealed' }).eq('id', board.id)
{
  const secs = await appears(/Proxy arkasından yazıldı/)
  if (secs == null) bad('açılış', 'the reveal never reached the room without a socket')
  else ok(`saw the reveal in ~${secs}s`)
}

// ---------------------------------------------------------------- next stop
console.log('\n-- sonraki durağa geçiş --')
await api.from('meetings').update({ active_stage_id: second.id }).eq('id', meeting.id)
await api.from('stages').update({ state: 'open' }).eq('id', second.id)
{
  const secs = await appears(/Tek Kelimeyle/)
  if (secs == null) bad('takip', 'the room did not follow to the next stop')
  else ok(`followed to the next stop in ~${secs}s`)
}

// ---------------------------------------------------------------- honesty
console.log('\n-- uygulama durumu dürüst anlatıyor mu --')
{
  const t = await text()
  // The old bug was a permanent, wrong "reconnecting" alarm. A calm, accurate
  // "no live connection, refreshing every few seconds" is fine — but it must
  // not sit there for three hours, so it shrinks to a dot once it has been read.
  if (/Yeniden bağlanıyor/i.test(t)) {
    bad('uyarı', 'the room is told it is reconnecting when it is in fact working by polling')
  } else ok('no false reconnecting alarm')
  await pg.waitForTimeout(16000)
  const stillBig = /Canlı bağlantı yok — birkaç saniyede bir yenileniyor/.test(await text())
  if (stillBig) bad('uyarı', 'the polling banner never retires — it would sit there all evening')
  else ok('the polling notice shrinks away once it has been read')
  await pg.goto(APP + '#/tani', { waitUntil: 'domcontentloaded' })
  await settle()
  const diag = await text()
  if (!/yoklama|websocket KAPALI|HAYIR/i.test(diag)) {
    bad('tanı', 'the diagnostics page does not report that the socket is down')
  } else ok('the diagnostics page reports the blocked socket honestly')
  note(`websocket attempts observed: ${socketAttempts}`)
}

console.log('\n════════════ RAPOR ════════════')
console.log(`problems: ${problems.length}`)
problems.forEach((p) => console.log('  ' + p))

await api.from('meetings').delete().eq('id', meeting.id)
await api.from('members').delete().eq('display_name', NAME)
await saveAllSessions()
await browser.close()
await server.close()
process.exit(problems.length ? 1 : 0)
