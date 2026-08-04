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
  const r = await pg.evaluate(() => {
    const world = document.querySelector('.stage-world') ?? document.querySelector('main')
    if (!world) return null
    const kids = [...world.children].filter(e => e.getBoundingClientRect().height > 0)
    const top = Math.min(...kids.map(e => e.getBoundingClientRect().top))
    const bot = Math.max(...kids.map(e => e.getBoundingClientRect().bottom))
    const wide = Math.max(...kids.map(e => e.getBoundingClientRect().width))
    return { h: Math.round(bot - top), vh: window.innerHeight, w: Math.round(wide), vw: window.innerWidth }
  })
  if (r) {
    const fill = Math.round((r.h / r.vh) * 100)
    const wpc = Math.round((r.w / r.vw) * 100)
    console.log(`${k.padEnd(16)} ${String(fill).padStart(4)}%  ${String(wpc).padStart(5)}%  ${r.h}x${r.w}`)
  }
}
await api.from('meetings').delete().eq('id', m.id)
await saveAllSessions(); await b.close(); await server.close()
