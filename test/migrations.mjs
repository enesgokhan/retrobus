// Which migrations are actually in the database?
//
// They are applied by hand — pasted into the SQL Editor — so there is no
// migration history table and nothing in the repo knows what the live database
// has. That is a real gap and it bit exactly the way you would expect: after a
// gap of a few days, "did I run 0022?" had no answer anywhere, and the only way
// to find out was to run four suites and read their output.
//
// This is that answer in one command:
//
//     node test/migrations.mjs
//
// It does not read the migration FILES — a file on disk says nothing about the
// database. Each row runs the suite that proves that migration's effect
// through the real write path, and reports what the database actually does.
import { spawn } from 'node:child_process'

const CHECKS = [
  ['0021', 'hidden stays hidden', 'hidden-test.mjs',
    'a card the host takes down is still SELECTed into every browser'],
  ['0022', 'revealing a stop reveals its poll', 'reveal-poll-test.mjs',
    '"Sonuçları aç" puts the room in results mode showing 0%'],
  ['0023', 'health progress is countable', 'progress-keys-test.mjs',
    'the shared screen reads 0/N for the whole health check'],
  ['0024', 'mission count', 'mission-count-test.mjs',
    'the console reports 0 missions next to a button that re-rolls them'],
]

const run = (file) =>
  new Promise((resolve) => {
    const p = spawn(process.execPath, [new URL(file, import.meta.url).pathname], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => resolve({ code, out }))
  })

console.log('Reading the live database. Each row runs the suite that proves that')
console.log('migration through the real write path — not the file on disk.\n')

let missing = 0
for (const [n, title, file, consequence] of CHECKS) {
  process.stdout.write(`  ${n}  ${title.padEnd(36)}`)
  const { code, out } = await run(file)
  if (code === 0) {
    console.log('APPLIED')
  } else {
    missing++
    console.log('NOT APPLIED')
    console.log(`        → ${consequence}`)
    // the one line the suite itself wrote about what went wrong
    const first = out.split('\n').find((l) => l.includes('✗'))
    if (first) console.log(`        ${first.trim()}`)
  }
}

console.log()
if (missing) {
  console.log(`${missing} migration(s) still to run. Paste the matching file(s) from`)
  console.log('supabase/migrations/ into the Supabase SQL Editor — all of them are')
  console.log('re-runnable, so running one twice costs nothing.')
} else {
  console.log('Every migration this repo knows about is live.')
}
process.exit(missing ? 1 : 0)
