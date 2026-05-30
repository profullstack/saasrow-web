import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client using the service-role/secret key. Bypasses RLS, so
 * callers MUST enforce their own authorization (admin token, owner token, or a
 * server-derived user id) before running privileged queries. Only ever import this
 * from server code (route handlers, server actions) — never from client components.
 */
let adminClient: SupabaseClient | undefined

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service env not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }
  adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return adminClient
}
