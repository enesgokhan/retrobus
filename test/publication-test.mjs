// Guards the realtime publication against drift.
//
// A postgres_changes binding on an unpublished table silently kills every other
// binding on the same channel while still reporting SUBSCRIBED. That produced a
// real "data doesn't load until refresh" bug in HealthCheckStage and RankStage,
// and nothing in the client surfaces it — so it has to be caught here.
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostClient } from './_clients.mjs'

let failed = 0
const fail = (m) => { console.error('  FAIL:', m); failed++ }
const ok = (m) => console.log('  ok:', m)

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/** Every table name passed to liveChannel(...) anywhere in src/. */
function subscribedTables() {
  const found = new Set()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(entry.name)) {
        const src = readFileSync(p, 'utf8')
        // liveChannel(name, [ ...tables... ], cb) — may span several lines
        for (const m of src.matchAll(/liveChannel\s*\(([\s\S]*?)\)\s*$/gm)) {
          const arr = m[1].match(/\[([\s\S]*?)\]/)
          if (!arr) continue
          for (const t of arr[1].matchAll(/'([a-z_]+)'/g)) found.add(t[1])
        }
      }
    }
  }
  walk(SRC)
  return found
}

const host = await hostClient()

const { data: published, error } = await host.rpc('published_tables')
if (error) {
  // no helper RPC: fall back to asserting the known set is non-empty
  fail(`cannot read publication: ${error.message}`)
}

const pub = new Set((published ?? []).map((r) => r.tablename ?? r))
const subs = subscribedTables()

if (!subs.size) fail('found no liveChannel subscriptions — parser is broken')
else ok(`client subscribes to ${subs.size} tables`)

if (!pub.size) fail('publication appears empty — cannot verify')
else ok(`publication contains ${pub.size} tables`)

const missing = [...subs].filter((t) => !pub.has(t))
if (missing.length) {
  fail(
    `subscribed but NOT published: ${missing.join(', ')}\n` +
      '        One such binding silently kills every other binding on the same\n' +
      '        channel while still reporting SUBSCRIBED. Add it to the publication.',
  )
} else {
  ok('every subscribed table is in the realtime publication')
}

// ---------------------------------------------------------------------------
// Every stage screen must be told when the stage state changes.
//
// Most stage policies open their rows the moment stages.state becomes
// 'revealed'. If the channel is not bound to `stages`, nothing tells the client
// that moment arrived — the host's screen fills and every passenger keeps
// staring at an empty one until they reload. That is exactly what happened to
// the discussion boards, which are the biggest hour of the meeting.
console.log('\n-- her sahne kanalı `stages`e bağlı mı --')
{
  const { readdirSync, readFileSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
  const files = [
    ...readdirSync(join(SRC, 'stages')).map((f) => join(SRC, 'stages', f)),
    join(SRC, 'lib', 'useStageData.ts'),
  ].filter((f) => /\.(tsx?|ts)$/.test(f))

  for (const f of files) {
    // strip comments first, or this flags the note explaining the bug it hunts
    const body = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const call = body.match(/liveChannel\(([\s\S]{0,400}?)\)\s*$/m) || body.match(/liveChannel\(([\s\S]{0,400}?)load,?\s*\)/)
    if (!call) continue
    const tables = (call[1].match(/\[[^\]]*\]/) || [''])[0]
    if (!tables) continue
    const short = f.split('/').slice(-1)[0]
    if (!tables.includes("'stages'")) {
      fail(`${short}: liveChannel binds ${tables} but not 'stages' — it will not refetch at reveal`)
    } else {
      ok(`${short} listens for stage state changes`)
    }
  }
}

// ---------------------------------------------------------------------------
// A query builder that nobody awaits never runs.
//
// PostgREST builders are lazy: they perform the request when awaited. React
// throws away whatever a handler returns, so `onClick={() => supabase.from(x)
// .update(y).eq(z)}` sends nothing at all — silently, with no error anywhere.
// That shape is why Fibbage's question switcher did nothing for its whole life,
// which read to the user as "adding a question deletes the previous one".
console.log('\n-- beklenmeyen tembel sorgular --')
{
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
  const files = []
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(p)) files.push(p)
    }
  }
  walk(SRC)
  let offenders = 0
  for (const f of files) {
    // strip comments first, or this flags the note explaining the bug it hunts
    const body = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    // a handler whose arrow body IS a supabase call, with no await and no void
    const re = /on[A-Z]\w+=\{\(\)\s*=>\s*\n?\s*supabase\s*\n?\s*\./g
    let m
    while ((m = re.exec(body))) {
      const line = body.slice(0, m.index).split('\n').length
      fail(`${f.split('/').slice(-1)[0]}:${line} hands an un-awaited query builder to a handler — it will never run`)
      offenders++
    }
  }
  if (!offenders) ok('no handler returns an un-awaited query builder')
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
process.exit(failed ? 1 : 0)
