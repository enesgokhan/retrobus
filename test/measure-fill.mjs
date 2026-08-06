// How much of the screen does each stage actually use?
//
// Not a pass/fail suite — a ruler. "The screens feel empty" was the hardest
// complaint to act on until this turned it into a number per stage, and the
// number said something more specific than the complaint did: it was the EMPTY
// states, not the populated ones. Before this batch every unconfigured stage
// used 6-12% of a 1600x1000 screen; a sentence of grey text near the top of an
// otherwise black page.
//
//   node test/measure-fill.mjs
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { hostClient } from './_clients.mjs'
import { personaContext, saveAllSessions } from './_browser.mjs'
const api = await hostClient()
await api.from('meetings').update({ status: 'done', active_stage_id: null }).eq('status', 'live')
const { data: m } = await api.from('meetings').insert({ title: 'Doluluk', status: 'live' }).select().single()
const KINDS = ['board','wordcloud','two_truths','health_check','feedback_wall','rank','quiz','fibbage','wavelength','codenames','lean_coffee','suggestions','poll','secret_mission','leaderboard']
let i = 0
const stages = {}
for (const k of KINDS) {
  const { data } = await api.from('stages').insert({
    meeting_id: m.id, kind: k, title: k, order_index: ++i,
    config: k === 'board' ? { identity: 'anon', reveal: 'live', dots: 3 } : {},
  }).select().single()
  stages[k] = data
}
const PORT = 4296, APP = `http://localhost:${PORT}/retrobus/`
const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const b = await chromium.launch()
const ctx = await personaContext(b, 'shots-host', { viewport: { width: 1600, height: 1000 } })
const pg = await ctx.newPage()
await pg.goto(APP + '#/oda', { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(3500)
const nb = pg.getByPlaceholder('örn. Enes')
if (await nb.count()) {
  await nb.fill('Enes')
  const boxes = pg.locator('input[inputmode="numeric"]')
  for (let j = 0; j < 6; j++) await boxes.nth(j).fill((process.env.RETROBUS_HOST_CODE ?? '424242')[j])
  await pg.waitForTimeout(6000)
  const sk = pg.getByRole('button', { name: 'Şimdilik geç' }); if (await sk.count()) { await sk.click(); await pg.waitForTimeout(800) }
}
console.log('kind             fill%  width%  content')
for (const k of KINDS) {
  await api.from('meetings').update({ active_stage_id: stages[k].id }).eq('id', m.id)
  await api.from('stages').update({ state: 'open' }).eq('id', stages[k].id)
  await pg.goto(APP + '#/oda', { waitUntil: 'domcontentloaded' })
  await pg.waitForTimeout(2600)
  const w = pg.getByRole('button', { name: 'Hadi başlayalım' }); if (await w.count()) { await w.click(); await pg.waitForTimeout(300) }
  // Measure INK, not the container.
  //
  // This used to take the bounding box of the stage wrapper's children, which
  // stopped meaning anything the moment those children became `flex-1` — every
  // one of the fifteen kinds then reported an identical 94% / 940×1458,
  // because what was being measured was the viewport with extra steps. Fifteen
  // different screens agreeing to the pixel is never a result; it is a broken
  // instrument.
  //
  // So: walk every element that actually paints something (a background, or a
  // non-empty text node), union their vertical extents, and report how much of
  // the viewport that union covers.
  const r = await pg.evaluate(() => {
    const vh = window.innerHeight
    const vw = window.innerWidth
    const spans = []
    let widest = 0
    for (const el of document.querySelectorAll('main *, .stage-world *')) {
      const b = el.getBoundingClientRect()
      if (b.width < 8 || b.height < 8 || b.top > vh || b.bottom < 0) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue
      const paints =
        cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
        cs.backgroundImage !== 'none' ||
        [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (!paints) continue
      spans.push([Math.max(0, b.top), Math.min(vh, b.bottom)])
      widest = Math.max(widest, Math.min(b.width, vw))
    }
    spans.sort((a, b) => a[0] - b[0])
    let painted = 0
    let cur = null
    for (const [t, bt] of spans) {
      if (!cur || t > cur[1]) {
        if (cur) painted += cur[1] - cur[0]
        cur = [t, bt]
      } else cur[1] = Math.max(cur[1], bt)
    }
    if (cur) painted += cur[1] - cur[0]
    return { h: Math.round(painted), vh, w: Math.round(widest), vw }
  })
  if (r) {
    const fill = Math.round((r.h / r.vh) * 100)
    const wpc = Math.round((r.w / r.vw) * 100)
    console.log(`${k.padEnd(16)} ${String(fill).padStart(4)}%  ${String(wpc).padStart(5)}%  ${r.h}x${r.w}`)
  }
}
await api.from('meetings').delete().eq('id', m.id)
await saveAllSessions(); await b.close(); await server.close()
