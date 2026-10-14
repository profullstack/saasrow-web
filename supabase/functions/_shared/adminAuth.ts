import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.76.1'

/**
 * Admin gate for edge functions: the X-Admin-Token header must match an unexpired
 * admin_tokens row (the same check as admin-submissions and app/lib/adminAuth.ts).
 * Returns the admin's email, or a ready-to-send 401/403 Response.
 *
 * An `adminEmail` in the request body is NOT proof of anything: the /api/fn proxy
 * forwards any caller, so functions that send mail must use this instead.
 */
export async function requireAdmin(
  req: Request,
  supabase: SupabaseClient,
  headers: Record<string, string>,
): Promise<{ email: string } | Response> {
  const token = req.headers.get('X-Admin-Token')
  if (!token) {
    return new Response(JSON.stringify({ error: 'Admin token required' }), {
      status: 401,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
  const { data } = await supabase
    .from('admin_tokens')
    .select('email')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!data) {
    return new Response(JSON.stringify({ error: 'Invalid or expired admin token' }), {
      status: 403,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
  return { email: (data as { email: string }).email }
}
