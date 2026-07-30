// Code hashing for 6-digit login codes — PBKDF2-SHA256 via WebCrypto
// (argon2 has no native binding in the edge runtime).
//
// Honest note: a 6-digit space is only 10^6 codes, so NO password hash makes
// an offline attack hard; the real protections are (a) the hash never leaving
// the database (column privileges), and (b) server-side rate limiting in the
// login function. PBKDF2 here is defense-in-depth, not the defense.

const ITERATIONS = 210_000
const KEY_BYTES = 32

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...bytes))
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

async function derive(code: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BYTES * 8,
  )
  return new Uint8Array(bits)
}

/** Returns "pbkdf2$<iterations>$<saltB64>$<hashB64>". */
export async function hashCode(code: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(code, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`
}

/** Constant-time comparison against a stored hash string. */
export async function verifyCode(code: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations < 1) return false
  const salt = fromB64(parts[2])
  const expected = fromB64(parts[3])
  const actual = await derive(code, salt, iterations)
  if (expected.length !== actual.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i]
  return diff === 0
}
