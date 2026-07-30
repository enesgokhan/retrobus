// Seeds the full default agenda and asserts every stage kind is one the UI can
// render. A stage that reaches the room with no component shows a placeholder,
// which on the day looks like a broken app.
import { readFileSync } from 'node:fs'
import { hostClient } from './_clients.mjs'

let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const host = await hostClient()

// --- what the UI can actually render, read straight from StageView ---
const stageView = readFileSync(new URL('../src/components/StageView.tsx', import.meta.url), 'utf8')
const handled = new Set()
for (const m of stageView.matchAll(/stage\.kind === '([a-z_]+)'/g)) handled.add(m[1])
for (const m of stageView.matchAll(/BOARD_KINDS = new Set\(\[([^\]]+)\]/g)) {
  for (const k of m[1].matchAll(/'([a-z_]+)'/g)) handled.add(k[1])
}
// 'break' intentionally has no component: the placeholder card IS the break screen
handled.add('break')
ok(`StageView handles: ${[...handled].sort().join(', ')}`)

// --- presets referenced by the default agenda must all exist ---
const presetsSrc = readFileSync(new URL('../src/lib/presets.ts', import.meta.url), 'utf8')
const presetKeys = new Set([...presetsSrc.matchAll(/^\s+key: '([a-z_0-9]+)',$/gm)].map((m) => m[1]))
const agendaKeys = [...presetsSrc.matchAll(/\{ preset: '([a-z_0-9]+)', minutes: (\d+) \}/g)]
  .map((m) => ({ key: m[1], minutes: Number(m[2]) }))

if (!agendaKeys.length) fail('could not parse DEFAULT_AGENDA')
const missing = agendaKeys.filter((a) => !presetKeys.has(a.key))
if (missing.length) fail(`agenda references unknown presets: ${missing.map((m) => m.key).join(', ')}`)
else ok(`all ${agendaKeys.length} agenda entries resolve to a preset`)

const total = agendaKeys.reduce((n, a) => n + a.minutes, 0)
if (total < 150 || total > 220) fail(`agenda is ${total} min, expected roughly 3 hours`)
else ok(`agenda totals ${total} min (~${(total / 60).toFixed(1)} h)`)

// --- seed it for real and check every row ---
const { data: meeting } = await host.from('meetings')
  .insert({ title: 'Agenda Testi', status: 'live' }).select().single()

const rows = []
let order = 1
for (const entry of agendaKeys) {
  // pull the preset block out of the source to get kind + title
  const block = presetsSrc.slice(presetsSrc.indexOf(`key: '${entry.key}'`))
  const kind = block.match(/kind: '([a-z_]+)'/)?.[1]
  const title = block.match(/title: '([^']+)'/)?.[1] ?? entry.key
  if (!kind) { fail(`no kind for preset ${entry.key}`); continue }
  rows.push({
    meeting_id: meeting.id,
    kind,
    title,
    order_index: order++,
    config: { timer_s: entry.minutes * 60 },
  })
}

const { error: insErr } = await host.from('stages').insert(rows)
if (insErr) {
  fail(`seeding the agenda failed: ${insErr.message}`)
} else {
  ok(`seeded ${rows.length} stages into a real meeting`)
}

const { data: seeded } = await host.from('stages')
  .select('kind, title, order_index, config').eq('meeting_id', meeting.id).order('order_index')

if ((seeded ?? []).length !== rows.length) {
  fail(`expected ${rows.length} stages, found ${seeded?.length}`)
} else {
  ok('every stage persisted')
}

// THE assertion: no seeded stage lands on the placeholder
const unrenderable = [...new Set((seeded ?? []).map((s) => s.kind))].filter((k) => !handled.has(k))
if (unrenderable.length) {
  fail(`agenda contains stage kinds with no UI component: ${unrenderable.join(', ')}`)
} else {
  ok('every stage kind in the agenda has a real component (no placeholders)')
}

// timers came through
const noTimer = (seeded ?? []).filter((s) => !s.config?.timer_s)
if (noTimer.length) fail(`${noTimer.length} stages have no timer`)
else ok('every stage carries a countdown')

// walking the agenda: activate each stage in turn, as the host would
let advanced = 0
for (const s of seeded ?? []) {
  const { data: row } = await host.from('stages')
    .select('id').eq('meeting_id', meeting.id).eq('order_index', s.order_index).single()
  const { error } = await host.from('meetings')
    .update({ active_stage_id: row.id }).eq('id', meeting.id)
  if (error) { fail(`could not activate stage ${s.order_index}: ${error.message}`); break }
  advanced++
}
if (advanced === (seeded ?? []).length) ok(`walked all ${advanced} stages as the host`)

await host.from('meetings').delete().eq('id', meeting.id)
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
