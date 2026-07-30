// Custom JWT mint/verify. Signed HS256 with the project's JWT secret so
// PostgREST + Realtime accept it and RLS can read our claims.
import { jwtVerify, SignJWT, type JWTPayload } from 'npm:jose@5'

const TOKEN_HOURS = 12

export interface RetrobusClaims extends JWTPayload {
  member_id: string
  is_host: boolean
  role: 'authenticated'
}

function secretKey(): Uint8Array {
  const secret = Deno.env.get('JWT_SECRET')
  if (!secret) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function mintToken(member: { id: string; is_host: boolean }): Promise<{ token: string; exp: number }> {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_HOURS * 3600
  const token = await new SignJWT({
    member_id: member.id,
    is_host: member.is_host,
    role: 'authenticated',
  } satisfies Partial<RetrobusClaims>)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(member.id)
    .setAudience('authenticated')
    .setIssuer('retrobus')
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secretKey())
  return { token, exp }
}

/** Verifies a caller token; returns claims or null. */
export async function verifyToken(authHeader: string | null): Promise<RetrobusClaims | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  try {
    const { payload } = await jwtVerify(authHeader.slice(7), secretKey(), { audience: 'authenticated' })
    if (typeof payload.member_id !== 'string') return null
    return payload as RetrobusClaims
  } catch {
    return null
  }
}
