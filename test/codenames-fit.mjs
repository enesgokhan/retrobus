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
const sizeFor = (w, presenter) =>
  w.length >= 10 ? (presenter ? 'text-2xl' : 'text-lg')
  : w.length >= 8 ? (presenter ? 'text-3xl' : 'text-lg')
  : (presenter ? 'text-4xl' : 'text-2xl')

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

for (const presenter of [false, true]) {
  const bad = await pg.evaluate(({ words, presenter, sizes }) => {
    const host = document.createElement('div')
    // the real grid: 5 columns inside the same max width the stage uses
    host.className = 'grid grid-cols-5 gap-3 w-full ' + (presenter ? 'max-w-6xl' : 'max-w-5xl')
    host.style.position = 'fixed'; host.style.top = '0'; host.style.left = '0'
    document.body.appendChild(host)
    const out = []
    words.forEach((w, i) => {
      const btn = document.createElement('button')
      btn.className = 'relative aspect-4/3 rounded-xl border-2 font-bold uppercase tracking-tight ' +
        'flex items-center justify-center text-center px-1 ' + sizes[i]
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
console.log(`${presenter ? 'presenter' : 'room     '}: ${bad.length ? 'OVERFLOW ' + bad.join(', ') : `all ${WORDS.length} words fit`}`)
}
await b.close(); await server.close()
console.log(failed ? '\nCHECK(S) FAILED' : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
