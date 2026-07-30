// POST /login { name, code } → { token, member, exp }
// Rate limited: 5 wrong tries per member → 15-minute cooldown.
// Never logs names or codes. Responses are deliberately uniform (401 for
// unknown name AND wrong code) so the roster can't be probed.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { json, preflight } from '../_shared/cors.ts'
import { verifyCode } from '../_shared/hash.ts'
import { mintToken } from '../_shared/jwt.ts'

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 5

const service = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

/** Small uniform delay so timing doesn't reveal which check failed. */
async function fail(req: Request, status: number, body: unknown): Promise<Response> {
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 250))
  return json(req, status, body)
}

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf
  if (req.method !== 'POST') return json(req, 405, { error: 'method' })

  let name = '', code = ''
  try {
    const body = await req.json()
    name = String(body.name ?? '').trim()
    code = String(body.code ?? '')
  } catch {
    return json(req, 400, { error: 'body' })
  }
  if (!name || name.length > 40 || !/^\d{6}$/.test(code)) {
    return fail(req, 401, { error: 'invalid' })
  }

  const { data: member } = await service
    .from('members')
    .select('id, display_name, is_host, code_hash')
    .ilike('display_name', name)
    .maybeSingle()

  if (!member) return fail(req, 401, { error: 'invalid' })
  if (!member.code_hash) return fail(req, 403, { error: 'no_code' })

  // --- throttle check ---
  const { data: attempts } = await service
    .from('login_attempts')
    .select('window_start, fail_count')
    .eq('member_id', member.id)
    .maybeSingle()

  const now = Date.now()
  if (attempts) {
    const windowAge = now - new Date(attempts.window_start).getTime()
    if (attempts.fail_count >= MAX_FAILS && windowAge < WINDOW_MS) {
      const retry = Math.ceil((WINDOW_MS - windowAge) / 1000)
      return fail(req, 429, { error: 'locked', retry_after_s: retry })
    }
    if (windowAge >= WINDOW_MS) {
      await service.from('login_attempts').delete().eq('member_id', member.id)
    }
  }

  const ok = await verifyCode(code, member.code_hash)
  if (!ok) {
    await service.from('login_attempts').upsert(
      {
        member_id: member.id,
        window_start: attempts && now - new Date(attempts.window_start).getTime() < WINDOW_MS
          ? attempts.window_start
          : new Date(now).toISOString(),
        fail_count: attempts && now - new Date(attempts.window_start).getTime() < WINDOW_MS
          ? attempts.fail_count + 1
          : 1,
      },
      { onConflict: 'member_id' },
    )
    return fail(req, 401, { error: 'invalid' })
  }

  await service.from('login_attempts').delete().eq('member_id', member.id)
  const { token, exp } = await mintToken({ id: member.id, is_host: member.is_host })
  return json(req, 200, {
    token,
    exp,
    member: { id: member.id, display_name: member.display_name, is_host: member.is_host },
  })
})
