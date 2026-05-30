/**
 * Client-safe helper for calling Supabase Edge Functions through the Next.js
 * server-side proxy at `/api/fn/<name>` (see app/api/fn/[name]/route.ts).
 *
 * The browser no longer talks to Supabase directly and never sends a Supabase key —
 * the proxy attaches a valid JWT server-side. Returns the raw Response so callers can
 * inspect `.ok`/`.status` and call `.json()` exactly as they did with the old fetch.
 */
export interface CallFnOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Query params appended to the URL. Object values are stringified; undefined skipped. */
  query?: Record<string, string | number | boolean | undefined> | string
  /** JSON body (object) or FormData for uploads. */
  body?: unknown
  /** Admin token, sent as the X-Admin-Token header. */
  adminToken?: string
  headers?: Record<string, string>
  signal?: AbortSignal
}

export async function callFn(name: string, opts: CallFnOptions = {}): Promise<Response> {
  const { method = 'GET', query, body, adminToken, headers = {}, signal } = opts

  let qs = ''
  if (typeof query === 'string') {
    qs = query ? (query.startsWith('?') ? query : `?${query}`) : ''
  } else if (query) {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) sp.set(k, String(v))
    }
    const s = sp.toString()
    if (s) qs = `?${s}`
  }

  const h: Record<string, string> = { ...headers }
  if (adminToken) h['X-Admin-Token'] = adminToken

  let payload: BodyInit | undefined
  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      payload = body
    } else {
      if (!h['Content-Type']) h['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
  }

  return fetch(`/api/fn/${name}${qs}`, { method, headers: h, body: payload, signal })
}
