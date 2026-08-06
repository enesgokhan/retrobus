// Touch targets, focus visibility and text scale — measured on the real DOM.
//
// The design system asserts "every interactive element >=44px" and "one focus
// ring, everywhere". Both are the kind of claim that is true on the day it is
// written and quietly false three screens later, because nothing checks it.
//
// Runs against any route that needs no session (default /tasarim, which renders
// every component in every state — so a regression in the KIT is caught here
// even when no screen happens to use that state yet).
import { chromium } from '@playwright/test'
import { preview } from 'vite'

const PORT = 4251
const route = process.argv[2] ?? '#/tasarim'
const width = Number(process.env.W ?? 1400)
const height = Number(process.env.H ?? 1000)
/** phones get the full 44; a dense desktop toolbar may sit at 36 by design */
const MIN = width < 700 ? 44 : 30

const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const browser = await chromium.launch()
// hasTouch matters: the comfortable touch sizes are behind `@media (pointer:
// coarse)`, so a narrow window WITHOUT touch is still measuring desktop CSS —
// which is correct, and is exactly why the media query keys on the pointer
// rather than on the width.
const page = await browser.newPage({
  viewport: { width, height },
  locale: 'tr-TR',
  hasTouch: width < 700,
  isMobile: width < 700,
})
await page.goto(`http://localhost:${PORT}/retrobus/${route}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)

const report = await page.evaluate((min) => {
  const small = []
  const noName = []
  const seen = new Set()
  const sel = 'button, a[href], input, textarea, select, [role="radio"], [role="menuitem"], [tabindex]:not([tabindex="-1"])'
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue // genuinely hidden
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue

    // An input wrapped in a <label> IS named, even with no aria-label — that
    // is the plain-HTML way to do it and the one `Field` uses. Checking only
    // aria-label/placeholder reported correctly-labelled fields as unnamed.
    const wrapping = el.closest('label')
    const label = (
      el.getAttribute('aria-label') ||
      el.textContent?.trim() ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      (wrapping ? wrapping.textContent?.trim() : '') ||
      (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() : '') ||
      ''
    ).slice(0, 40)

    const key = `${el.tagName}:${label}:${Math.round(r.width)}x${Math.round(r.height)}`
    if (seen.has(key)) continue
    seen.add(key)

    if (r.height < min || r.width < 24) {
      small.push({ tag: el.tagName.toLowerCase(), label, w: Math.round(r.width), h: Math.round(r.height) })
    }
    // an control with no accessible name at all is unusable by a screen reader
    if (!label && !el.getAttribute('aria-labelledby')) {
      noName.push({ tag: el.tagName.toLowerCase(), cls: el.className.toString().slice(0, 50) })
    }
  }

  // Focus: tab to the first control and confirm SOMETHING visibly changes.
  // A ring that renders `outline: none` everywhere is the single most common
  // way a design system silently becomes keyboard-hostile.
  const first = document.querySelector('button, a[href], input')
  let focusOk = false
  if (first) {
    first.focus()
    const cs = getComputedStyle(first)
    focusOk =
      (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
      cs.boxShadow !== 'none'
  }

  return {
    small,
    noName,
    focusOk,
    bodyPx: parseFloat(getComputedStyle(document.body).fontSize),
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
  }
}, MIN)

console.log(`${route} @ ${width}×${height}  (min target ${MIN}px)`)
console.log(`  body font-size      ${report.bodyPx}px`)
console.log(`  horizontal overflow ${report.overflowX}`)
console.log(`  focus ring visible  ${report.focusOk}`)

let fails = 0
if (report.small.length) {
  console.log(`\n  ${report.small.length} target(s) under ${MIN}px:`)
  for (const s of report.small) console.log(`    ${s.w}×${s.h}  <${s.tag}> ${s.label}`)
  fails += report.small.length
}
if (report.noName.length) {
  console.log(`\n  ${report.noName.length} control(s) with no accessible name:`)
  for (const s of report.noName) console.log(`    <${s.tag}> ${s.cls}`)
  fails += report.noName.length
}
if (report.overflowX) fails++
if (!report.focusOk) fails++

console.log(`\n${fails ? `${fails} problem(s)` : 'ALL CHECKS PASSED'}`)
await browser.close()
await server.close()
process.exit(fails ? 1 : 0)
