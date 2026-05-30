import 'server-only'
import { getSupabaseAdmin } from './supabaseAdmin'

/**
 * Validate an admin session token (the value the admin UI stores in
 * sessionStorage as 'adminToken' and sends as the X-Admin-Token header).
 * Mirrors the edge functions' check: a row in admin_tokens whose token matches
 * and whose expires_at is still in the future.
 */
export async function validateAdminToken(token: string | null | undefined): Promise<{ ok: boolean; email?: string }> {
  if (!token) return { ok: false }
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('admin_tokens')
    .select('email, expires_at')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!data) return { ok: false }
  return { ok: true, email: (data as { email: string }).email }
}

/** Read the admin token from the standard header. */
export function adminTokenFromRequest(req: Request): string | null {
  return req.headers.get('x-admin-token')
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function unauthorized(): Response {
  return jsonResponse({ error: 'Unauthorized' }, 401)
}
