// Guards against column-grant drift.
//
// THE BUG THIS EXISTS FOR: migration 0003 added `members.avatar` and granted
// `update (avatar)` but never `select (avatar)`. Eight components select it
// directly from `members`, so every one of those queries returned 42501 and the
// member list arrived EMPTY — Codenames lobby with no players, Wavelength with
// no assignable teams, every name rendered "—". The app looked broken in
// exactly the way that was reported.
//
// The integration suites all passed, because they select explicit column lists
// that happen to omit `avatar`. Only the client's own queries expose it. So this
// test reads the SELECTS OUT OF src/ and checks each named column against
// has_column_privilege — the same shape as publication-test.mjs, which already
// caught a repeat of the realtime bug.
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostClient } from './_clients.mjs'

let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/**
 * Every `.from('table').select('a, b, c')` pair found in src/.
 * Deliberately simple: it only understands the literal form the codebase uses,
 * and a select('*') is reported so it can be judged by eye.
 */
function selectsInSource() {
  const found = [] // { table, columns[], file }
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(entry.name)) {
        const src = readFileSync(p, 'utf8')
        // .from('x') ... .select('a, b') possibly across a line break
        const re = /\.from\(\s*'([a-z_]+)'\s*\)\s*(?:\r?\n\s*)?\.select\(\s*'([^']*)'/g
        for (const m of src.matchAll(re)) {
          found.push({
            table: m[1],
            columns: m[2].split(',').map((c) => c.trim()).filter(Boolean),
            file: entry.name,
          })
        }
      }
    }
  }
  walk(SRC)
  return found
}

const host = await hostClient()
const selects = selectsInSource()

if (!selects.length) {
  fail('parsed no .from().select() pairs — the parser is broken, not the app')
  process.exit(1)
}
ok(`parsed ${selects.length} select() calls from src/`)

// Ask the database which columns `authenticated` may actually read.
const { data: privRows, error } = await host.rpc('selectable_columns')
if (error) {
  fail(`cannot read column privileges: ${error.message}`)
  process.exit(1)
}
/** table -> Set(readable columns) */
const readable = new Map()
for (const r of privRows ?? []) {
  if (!readable.has(r.table_name)) readable.set(r.table_name, new Set())
  readable.get(r.table_name).add(r.column_name)
}
ok(`database reports readable columns for ${readable.size} tables`)

const problems = []
const starSelects = []

for (const s of selects) {
  if (s.columns.length === 1 && s.columns[0] === '*') {
    starSelects.push(`${s.table} (${s.file})`)
    continue
  }
  const allowed = readable.get(s.table)
  if (!allowed) {
    // table not selectable at all by authenticated — legitimate for some
    // (e.g. login_attempts) but then the client should not be selecting it
    problems.push(`${s.table}.* — table not selectable by authenticated (${s.file})`)
    continue
  }
  for (const col of s.columns) {
    // skip embedded resource syntax and aliases; the codebase does not use them
    if (/[():]/.test(col)) continue
    if (!allowed.has(col)) {
      problems.push(`${s.table}.${col} — selected in ${s.file} but NOT granted`)
    }
  }
}

if (problems.length) {
  fail(
    `client selects ${problems.length} column(s) it has no privilege to read:\n` +
      problems.map((p) => `          ${p}`).join('\n') +
      '\n        Each of these silently returns 42501 and leaves the caller with an\n' +
      '        EMPTY result — no error surfaces in the UI.',
  )
} else {
  ok('every column the client selects is actually granted')
}

// `select('*')` on a table with column-level grants is a latent version of the
// same bug: adding a restricted column later breaks the query with no warning.
if (starSelects.length) {
  const risky = starSelects.filter((s) => {
    const table = s.split(' ')[0]
    // members and fibbage_lies are the tables with column-level grants
    return table === 'members' || table === 'fibbage_lies'
  })
  if (risky.length) {
    fail(`select('*') on a table with column-level grants: ${risky.join(', ')}`)
  } else {
    ok(`${starSelects.length} select('*') calls, none on column-restricted tables`)
  }
}



console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
