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

/**
 * Pull a token's value. The light theme redefines a subset inside
 * `:root[data-theme='light'] { … }`, so read that block first and fall back to
 * the @theme default — which is exactly how the cascade resolves it at runtime.
 */
const LIGHT_BLOCK = (/:root\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/.exec(css) ?? [, ''])[1]

function token(name, theme = 'dark') {
  if (theme === 'light') {
    const m = new RegExp(`\\s${name}:\\s*([^;]+);`).exec(LIGHT_BLOCK)
    if (m) return m[1].trim()
  }
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

const surfaces = (t) => ({
  bg: parse(token('--color-bg', t)),
  'bg-1': parse(token('--color-bg-1', t)),
  'bg-2': parse(token('--color-bg-2', t)),
  'bg-3': parse(token('--color-bg-3', t)),
})
const labels = (t) => ({
  label: parse(token('--color-label', t)),
  'label-2': parse(token('--color-label-2', t)),
  'label-3': parse(token('--color-label-3', t)),
  'label-4': parse(token('--color-label-4', t)),
})

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

const TINT_ROLES = ['blue', 'teal', 'purple', 'pink', 'orange', 'yellow', 'green', 'gray', 'brand']
const STATUS = ['ok', 'warn', 'bad']

// Both themes are measured. Shipping a light theme whose tints were picked for
// a black ground is how #ffd60a ends up as body text on white.
for (const theme of ['dark', 'light']) {
  const SURFACES = surfaces(theme)
  const LABELS = labels(theme)
  console.log(`\n################ ${theme} ################`)

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

  console.log('=== tint as text on surface ===')
  for (const t of TINT_ROLES) {
    const tc = parse(token(`--color-${t}`, theme))
    for (const sn of ['bg', 'bg-1']) {
      const r = ratio(tc, SURFACES[sn])
      const pass = r >= 4.5
      if (!pass) fails++
      console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${t.padEnd(7)} on ${sn.padEnd(4)} ${r.toFixed(2)}:1`)
    }
  }

  console.log('=== status colours as text ===')
  for (const st of STATUS) {
    const c = parse(token(`--color-${st}`, theme))
    for (const sn of ['bg', 'bg-1']) {
      const r = ratio(c, SURFACES[sn])
      const pass = r >= 4.5
      if (!pass) fails++
      console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${st.padEnd(5)} on ${sn.padEnd(4)} ${r.toFixed(2)}:1`)
    }
  }
}

// The primary action is near-white on dark / near-black on light, so it is the
// one fill whose contrast is set by the button tokens rather than by a tint.
console.log('\n################ primary action ################')
for (const [theme, bgHex, inkHex] of [
  ['dark', '#e8e8ee', '#0c0c10'],
  ['light', '#1c1c22', '#ffffff'],
]) {
  const r = ratio(parse(inkHex), parse(bgHex))
  const pass = r >= 4.5
  if (!pass) fails++
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${theme.padEnd(5)} ${inkHex} on ${bgHex}  ${r.toFixed(2)}:1`)
}

// Text placed ON a stage tint, per theme.
//
// theme.ts used to store literal hexes here and this loop parsed them out with
// a regex. Two problems: the hexes were the DARK values, so the light theme's
// re-picked tints were unreachable inside a stop (the finale ran #ffd60a as
// text on white, 1.41:1) — and once that was fixed to token references the
// regex would have matched nothing and this check would have passed by
// measuring zero pairs. It resolves tokens now, in both themes.
console.log('\n################ tint-ink on tint ################')
const themeSrc = readFileSync(new URL('../src/lib/theme.ts', import.meta.url), 'utf8')
const pairs = [...themeSrc.matchAll(
  /tint:\s*'var\(--color-([a-z]+)\)',\s*tintInk:\s*'var\(--ink-on-([a-z]+)\)'/g,
)]
if (!pairs.length) {
  console.log('  FAIL  no tint/ink pairs found in theme.ts — this check is measuring nothing')
  fails++
}
for (const theme of ['dark', 'light']) {
  for (const [, tintTok, inkTok] of pairs) {
    const tint = parse(token(`--color-${tintTok}`, theme))
    const ink = parse(token(`--ink-on-${inkTok}`, theme))
    const r = ratio(ink, tint)
    const pass = r >= 4.5
    if (!pass) fails++
    console.log(
      `  ${pass ? 'ok  ' : 'FAIL'} ${theme.padEnd(5)} ink-on-${inkTok.padEnd(7)} ${r.toFixed(2)}:1`,
    )
  }
}

console.log(`\n${fails} failure(s), ${warns} warning(s)`)
process.exit(fails ? 1 : 0)
