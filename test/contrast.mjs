// Measured contrast, not asserted contrast.
//
// The design system claims "≥4.5:1 on text" in several comments. Nobody had
// ever computed it. Translucent label colours make this non-obvious by hand:
// `--color-label-2` is rgba(235,235,245,0.62), which is a DIFFERENT effective
// colour on every surface it sits on, so eyeballing the hex tells you nothing.
//
// This composites each label over each surface it is actually used on and
// reports the WCAG 2.1 ratio.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

/** pull `--name: value;` out of the @theme block */
function token(name) {
  const m = new RegExp(`\\s${name}:\\s*([^;]+);`).exec(css)
  if (!m) throw new Error(`token not found: ${name}`)
  return m[1].trim()
}

function parse(v) {
  v = v.trim()
  let m = /^#([0-9a-f]{6})$/i.exec(v)
  if (m) {
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(v)
  if (m) {
    const p = m[1].split(',').map((s) => parseFloat(s))
    return [p[0], p[1], p[2], p[3] ?? 1]
  }
  throw new Error(`cannot parse colour: ${v}`)
}

/** src over dst */
function over([r, g, b, a], [dr, dg, db]) {
  return [r * a + dr * (1 - a), g * a + dg * (1 - a), b * a + db * (1 - a), 1]
}

function luminance([r, g, b]) {
  const f = (c) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function ratio(fg, bg) {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const SURFACES = {
  bg: parse(token('--color-bg')),
  'bg-1': parse(token('--color-bg-1')),
  'bg-2': parse(token('--color-bg-2')),
  'bg-3': parse(token('--color-bg-3')),
}

const LABELS = {
  label: parse(token('--color-label')),
  'label-2': parse(token('--color-label-2')),
  'label-3': parse(token('--color-label-3')),
  'label-4': parse(token('--color-label-4')),
}

const TINTS = ['blue', 'teal', 'purple', 'pink', 'orange', 'yellow', 'green', 'gray', 'brand']

// Text sizes each role is actually used at, so the right threshold applies.
// WCAG large text = >=18.66px bold or >=24px regular.
const ROLE = {
  label: { min: 4.5, note: 'body text' },
  'label-2': { min: 4.5, note: 'secondary prose' },
  'label-3': { min: 4.5, note: 'metadata, overlines — carries meaning' },
  'label-4': { min: 1.0, note: 'DECORATIVE ONLY — never carries meaning' },
}

let fails = 0
let warns = 0

console.log('=== label on surface ===')
for (const [ln, lc] of Object.entries(LABELS)) {
  for (const [sn, sc] of Object.entries(SURFACES)) {
    const r = ratio(over(lc, sc), sc)
    const min = ROLE[ln].min
    const pass = r >= min
    if (!pass) fails++
    console.log(
      `  ${pass ? 'ok  ' : 'FAIL'} ${ln.padEnd(8)} on ${sn.padEnd(5)} ${r.toFixed(2)}:1  (needs ${min})  ${ROLE[ln].note}`,
    )
  }
}

console.log('\n=== tint as text on surface (btn-tinted, chip-on, links) ===')
for (const t of TINTS) {
  const tc = parse(token(`--color-${t}`))
  for (const sn of ['bg', 'bg-1']) {
    const sc = SURFACES[sn]
    const r = ratio(tc, sc)
    // tint text is >=15px semibold; 4.5 is the honest bar
    const pass = r >= 4.5
    if (!pass) {
      warns++
      console.log(`  WARN ${t.padEnd(7)} on ${sn.padEnd(4)} ${r.toFixed(2)}:1  (want 4.5)`)
    } else {
      console.log(`  ok   ${t.padEnd(7)} on ${sn.padEnd(4)} ${r.toFixed(2)}:1`)
    }
  }
}

console.log('\n=== tint-ink on tint (btn-filled: text ON the accent) ===')
// these live in lib/theme.ts, paired with each world
const theme = readFileSync(new URL('../src/lib/theme.ts', import.meta.url), 'utf8')
for (const m of theme.matchAll(/tint:\s*'(#[0-9a-f]{6})',\s*tintInk:\s*'(#[0-9a-f]{6})'/gi)) {
  const [, tint, ink] = m
  const r = ratio(parse(ink), parse(tint))
  const pass = r >= 4.5
  if (!pass) fails++
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${ink} on ${tint}  ${r.toFixed(2)}:1`)
}

console.log('\n=== status colours as text ===')
for (const s of ['ok', 'warn', 'bad']) {
  const c = parse(token(`--color-${s}`))
  for (const sn of ['bg', 'bg-1']) {
    const r = ratio(c, SURFACES[sn])
    const pass = r >= 4.5
    if (!pass) warns++
    console.log(`  ${pass ? 'ok  ' : 'WARN'} ${s.padEnd(5)} on ${sn.padEnd(4)} ${r.toFixed(2)}:1`)
  }
}

console.log(`\n${fails} failure(s), ${warns} warning(s)`)
process.exit(fails ? 1 : 0)
