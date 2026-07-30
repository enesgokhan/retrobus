// POST /set-member-code { member_id, code } — host only.
// The single path through which a 6-digit code is (re)assigned; codes are
// hashed here and the plaintext is never stored or logged.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { json, preflight } from '../_shared/cors.ts'
import { hashCode } from '../_shared/hash.ts'
import { verifyToken } from '../_shared/jwt.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const service = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

Deno.serve(async (req) => {
  const pf = preflight(req)
  if (pf) return pf
  if (req.method !== 'POST') return json(req, 405, { error: 'method' })

  const claims = await verifyToken(req.headers.get('authorization'))
  if (!claims?.is_host) return json(req, 403, { error: 'host_only' })

  let memberId = '', code = ''
  try {
    const body = await req.json()
    memberId = String(body.member_id ?? '')
    code = String(body.code ?? '')
  } catch {
    return json(req, 400, { error: 'body' })
  }
  if (!UUID_RE.test(memberId) || !/^\d{6}$/.test(code)) {
    return json(req, 400, { error: 'invalid' })
  }

  const code_hash = await hashCode(code)
  const { error } = await service.from('members').update({ code_hash }).eq('id', memberId)
  if (error) return json(req, 500, { error: 'db' })

  // A fresh code also clears any lockout the member had accumulated.
  await service.from('login_attempts').delete().eq('member_id', memberId)
  return json(req, 200, { ok: true })
})
