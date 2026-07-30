// CORS for the static SPA (GitHub Pages + local dev).
// Origins come from the ALLOWED_ORIGINS env (comma-separated); the browser
// origin is reflected back only if it is on the list.

const DEFAULT_ORIGINS = ['https://enesgokhan.github.io', 'http://localhost:5173']

function allowedOrigins(): string[] {
  const env = Deno.env.get('ALLOWED_ORIGINS')
  return env ? env.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ORIGINS
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allow = allowedOrigins().includes(origin) ? origin : allowedOrigins()[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
  return null
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}
