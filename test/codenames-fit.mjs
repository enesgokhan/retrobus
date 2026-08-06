// Does a long Turkish word fit a Codenames tile?
//
// HELİKOPTER visibly overflowed its card on the shared screen. Measuring this
// through a real dealt game needs four seated players and a deal, so instead
// this renders the exact tile markup with the app's own compiled classes and
// measures it — same CSS, no game required.
import { chromium } from '@playwright/test'
import { preview } from 'vite'
const PORT = 4304, APP = `http://localhost:${PORT}/retrobus/`
const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const b = await chromium.launch()
const pg = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
await pg.goto(APP, { waitUntil: 'domcontentloaded' })
await pg.waitForTimeout(1500)

let failed = 0
const WORDS = ['HELİKOPTER', 'KAPLUMBAĞA', 'BİLGİSAYAR', 'ELEKTRİKÇİ', 'ŞEMSİYE', 'MERDİVEN', 'GİTAR', 'KAR', 'AY']
// Mirrors CodenamesStage's ladder exactly. It is a copy, and a copy drifts —
// it had already drifted once — so if you change the component, change this.
const sizeFor = (w, presenter) =>
  w.length >= 10 ? (presenter ? 'text-2xl' : 'text-[2.1vw] sm:text-subhead lg:text-base')
  : w.length >= 8 ? (presenter ? 'text-3xl' : 'text-[2.5vw] sm:text-base lg:text-headline')
  : (presenter ? 'text-4xl' : 'text-[3vw] sm:text-xl lg:text-2xl')

// CONTROL: the old behaviour was one fixed size for every word. If this does
// not overflow, the measurement is not measuring anything.
{
  const bad = await pg.evaluate(({ words }) => {
    const host = document.createElement('div')
    host.className = 'grid grid-cols-5 gap-3 w-full max-w-6xl'
    host.style.position = 'fixed'; host.style.top = '0'; host.style.left = '0'
    document.body.appendChild(host)
    const out = []
    words.forEach((w) => {
      const btn = document.createElement('button')
      btn.className = 'relative aspect-4/3 rounded-xl border-2 font-bold uppercase tracking-tight flex items-center justify-center text-center px-1 text-4xl'
      const span = document.createElement('span')
      span.className = 'leading-tight break-normal hyphens-none'
      span.textContent = w
      btn.appendChild(span); host.appendChild(btn)
    })
    for (const btn of host.children) {
      const span = btn.querySelector('span')
      const tr = btn.getBoundingClientRect(), sr = span.getBoundingClientRect()
      if (sr.width > tr.width - 6) out.push(span.textContent)
    }
    host.remove()
    return out
  }, { words: WORDS })
  if (!bad.length) failed++
console.log(`control  : old fixed size overflows on ${bad.length ? bad.join(', ') : 'NOTHING — this test proves nothing'}`)
}

for (const { presenter, width } of [
  { presenter: false, width: 430 },  // a passenger holding a phone
  { presenter: false, width: 1600 }, // a passenger on a laptop
  { presenter: true, width: 1600 },  // the projected board
]) {
  await pg.setViewportSize({ width, height: 1000 })
  await pg.waitForTimeout(150)
  const bad = await pg.evaluate(({ words, presenter, sizes }) => {
    const host = document.createElement('div')
    // the real grid: 5 columns inside the same max width the stage uses
    host.className = 'grid grid-cols-5 gap-1.5 sm:gap-3 w-full ' + (presenter ? 'max-w-6xl' : 'max-w-5xl')
    host.style.position = 'fixed'; host.style.top = '0'; host.style.left = '0'
    document.body.appendChild(host)
    const out = []
    words.forEach((w, i) => {
      const btn = document.createElement('button')
      btn.className = 'relative aspect-square sm:aspect-4/3 rounded-lg sm:rounded-xl ' +
        'font-semibold uppercase tracking-tight overflow-hidden leading-[1.1] ' +
        'flex items-center justify-center text-center px-1 sm:px-1.5 ' + sizes[i]
      const span = document.createElement('span')
      span.className = 'leading-tight break-normal hyphens-none'
      span.textContent = w
      btn.appendChild(span); host.appendChild(btn)
    })
    for (const btn of host.children) {
      const span = btn.querySelector('span')
      const tr = btn.getBoundingClientRect(), sr = span.getBoundingClientRect()
      if (sr.width > tr.width - 6) out.push(`${span.textContent} (${Math.round(sr.width)}>${Math.round(tr.width)})`)
    }
    host.remove()
    return out
  }, { words: WORDS, presenter, sizes: WORDS.map((w) => sizeFor(w, presenter)) })
  if (bad.length) failed++
  const who = presenter ? 'presenter' : `room ${width}`
  console.log(`${who.padEnd(10)}: ${bad.length ? 'OVERFLOW ' + bad.join(', ') : `all ${WORDS.length} words fit`}`)
}
await b.close(); await server.close()
console.log(failed ? '\nCHECK(S) FAILED' : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
