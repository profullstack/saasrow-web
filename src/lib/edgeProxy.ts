import 'server-only'
import { createSupabaseServerClient } from './supabaseServer'

/**
 * Server-side proxy to Supabase Edge Functions.
 *
 * The browser used to call `${SUPABASE_URL}/functions/v1/<name>` directly with the
 * public anon key in `Authorization`. After migrating to the new publishable key
 * (which is NOT a JWT), the edge-function gateway's `verify_jwt` check rejects those
 * calls. Routing through Next.js server routes lets us attach a valid JWT server-side
 * and keep keys out of the browser.
 *
 * Auth model:
 *  - USER-context functions forward the end-user's Supabase session JWT (from cookies)
 *    so the function can identify the user; they fall back to the anon JWT when there
 *    is no session (anonymous voting/commenting is allowed by those functions).
 *  - Every other function gets the server-only legacy anon JWT, which satisfies the
 *    gateway. The functions still perform their own in-body checks (management tokens,
 *    X-Admin-Token, ADMIN_EMAIL), and we pass those through untouched.
 */

// Functions that key behaviour off the caller's identity. Keep in sync when adding new ones.
const USER_CONTEXT_FUNCTIONS = new Set(['vote', 'comments', 'bookmarks'])

// Headers we forward from the client to the edge function (lowercased).
const FORWARDED_HEADERS = ['content-type', 'x-admin-token']

function edgeConfig(): { url: string; jwt: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Server-only legacy anon JWT that satisfies the gateway's verify_jwt. Falls back to
  // the public anon key, which today is also the legacy anon JWT.
  const jwt = process.env.SUPABASE_EDGE_ANON_JWT || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !jwt) {
    throw new Error('Edge proxy not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_EDGE_ANON_JWT)')
  }
  return { url, jwt }
}

/** Forward an incoming Next.js request to the named edge function, returning its response. */
export async function forwardToEdge(name: string, req: Request): Promise<Response> {
  const { url, jwt } = edgeConfig()
  const search = new URL(req.url).search
  const target = `${url}/functions/v1/${name}${search}`

  // Decide the Authorization token.
  let authToken = jwt
  if (USER_CONTEXT_FUNCTIONS.has(name)) {
    try {
      const sb = await createSupabaseServerClient()
      const { data } = await sb.auth.getSession()
      if (data.session?.access_token) authToken = data.session.access_token
    } catch {
      // No session / cookies unavailable — fall back to the anon JWT.
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${authToken}`,
    apikey: jwt,
  }
  for (const h of FORWARDED_HEADERS) {
    const v = req.headers.get(h)
    if (v) headers[h] = v
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const body = hasBody ? await req.text() : undefined

  const res = await fetch(target, { method: req.method, headers, body })

  const text = await res.text()
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  })
}
