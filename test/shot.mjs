// A ruler, not a suite.
//
// Screenshots a route (default /tasarim, which needs no session) at a given
// width and reports how much of the viewport actually carries content. Design
// work without a picture of the result is how seven batches went in without
// anyone able to judge them as a whole.
//
//   node test/shot.mjs                        → /tasarim at 1600
//   node test/shot.mjs '#/tasarim' 430 out.png
import { chromium } from '@playwright/test'
import { preview } from 'vite'

const PORT = 4249
const route = process.argv[2] ?? '#/tasarim'
const width = Number(process.argv[3] ?? 1600)
const out = process.argv[4] ?? '/tmp/shot.png'
const height = Number(process.env.H ?? 1000)

const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width, height }, locale: 'tr-TR' })
page.on('pageerror', (e) => console.log(`!! JS: ${e.message.slice(0, 200)}`))
page.on('console', (m) => m.type() === 'error' && console.log(`!! console: ${m.text().slice(0, 200)}`))

await page.goto(`http://localhost:${PORT}/retrobus/${route}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.screenshot({ path: out, fullPage: process.env.FULL === '1' })

const m = await page.evaluate(() => {
  const vw = innerWidth
  const vh = innerHeight
  let painted = 0
  const seen = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue
    if (r.top > vh || r.bottom < 0) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue
    const hasInk =
      cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
      (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    if (!hasInk) continue
    seen.push([Math.max(0, r.top), Math.min(vh, r.bottom)])
  }
  seen.sort((a, b) => a[0] - b[0])
  let cur = null
  for (const [t, b] of seen) {
    if (!cur || t > cur[1]) {
      if (cur) painted += cur[1] - cur[0]
      cur = [t, b]
    } else cur[1] = Math.max(cur[1], b)
  }
  if (cur) painted += cur[1] - cur[0]
  return {
    fill: Math.round((painted / vh) * 100),
    scrollH: document.documentElement.scrollHeight,
    vw,
    vh,
    overflowX: document.documentElement.scrollWidth > vw + 1,
  }
})

console.log(`${route} @ ${width}×${height} → ${out}`)
console.log(`  vertical fill ${m.fill}%   page height ${m.scrollH}px   horizontal overflow: ${m.overflowX}`)

await browser.close()
await server.close()
