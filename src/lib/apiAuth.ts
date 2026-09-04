import 'server-only'
import { getSupabaseAdmin } from './supabaseAdmin'
import { ApiError } from './publicApi'
import {
  bearerToken,
  generateApiKey,
  hashLoginCode,
  looksLikeApiKey,
  normalizeKeyName,
  serializeApiKey,
  sha256Hex,
  LOGIN_CODE_MAX_ATTEMPTS,
  type ApiKeyRow,
} from './apiKeys'

// Authentication for the write side of the public API, the MCP server's
// write tools and the CLI. Two credentials are accepted:
//
//  - `Authorization: Bearer sr_…`  an API key (CLI, MCP, scripts)
//  - `X-Management-Token: …`        the token from a /manage/{token} link, so
//                                   the website's manage page can drive the
//                                   same key-management endpoints.
//
// Both resolve to a row in `users`. The read side of the API stays keyless.

export interface ApiPrincipal {
  userId: string
  email: string
  /** Set when authenticated with an API key; null for a management token. */
  keyId: string | null
  via: 'api_key' | 'management_token'
}

const KEY_COLUMNS = 'id, user_id, name, key_prefix, created_at, last_used_at, revoked_at'

/** Find or create the `users` row for an email. Emails are unique there. */
export async function ensureUser(email: string): Promise<{ id: string; email: string }> {
  const supabase = getSupabaseAdmin()
  const { data: existing, error } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email)
    .maybeSingle()
  if (error) throw new Error(`ensureUser lookup failed: ${error.message}`)
  if (existing) return existing as { id: string; email: string }

  const { data: created, error: insertError } = await supabase
    .from('users')
    .insert({ email })
    .select('id, email')
    .single()
  if (insertError) {
    // Lost a race with a concurrent signup for the same address.
    const { data: again } = await supabase.from('users').select('id, email').eq('email', email).maybeSingle()
    if (again) return again as { id: string; email: string }
    throw new Error(`ensureUser insert failed: ${insertError.message}`)
  }
  return created as { id: string; email: string }
}

async function principalFromApiKey(raw: string): Promise<ApiPrincipal | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, revoked_at, last_used_at, users(email)')
    .eq('key_hash', sha256Hex(raw))
    .maybeSingle()
  if (error) throw new Error(`api key lookup failed: ${error.message}`)
  if (!data || data.revoked_at) return null

  const row = data as unknown as {
    id: string
    user_id: string
    last_used_at: string | null
    users: { email: string } | { email: string }[] | null
  }
  const user = Array.isArray(row.users) ? row.users[0] : row.users
  if (!user?.email) return null

  // Touch last_used_at at most once a minute; it is a hint, not an audit log.
  const lastUsed = row.last_used_at ? Date.parse(row.last_used_at) : 0
  if (Date.now() - lastUsed > 60_000) {
    void supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', row.id)
      .then(() => undefined, () => undefined)
  }

  return { userId: row.user_id, email: user.email, keyId: row.id, via: 'api_key' }
}

/**
 * A management token is either a `user_tokens.token` (one per account) or a
 * `software_submissions.management_token` (one per listing). Older listings
 * were inserted without `user_id`; when we meet one we link it to the
 * contact email's user so the account owns it from then on.
 */
export async function resolveManagementToken(token: string): Promise<ApiPrincipal | null> {
  if (!token || token.length > 200) return null
  const supabase = getSupabaseAdmin()

  const { data: userToken } = await supabase
    .from('user_tokens')
    .select('user_id, email')
    .eq('token', token)
    .maybeSingle()
  if (userToken) {
    const ut = userToken as { user_id: string | null; email: string | null }
    if (ut.user_id && ut.email) {
      return { userId: ut.user_id, email: ut.email, keyId: null, via: 'management_token' }
    }
    if (ut.email) {
      const user = await ensureUser(ut.email.toLowerCase())
      return { userId: user.id, email: user.email, keyId: null, via: 'management_token' }
    }
  }

  const { data: submission } = await supabase
    .from('software_submissions')
    .select('id, user_id')
    .eq('management_token', token)
    .maybeSingle()
  if (!submission) return null
  const sub = submission as { id: string; user_id: string | null }

  const { data: contact } = await supabase
    .from('submission_contacts')
    .select('email')
    .eq('submission_id', sub.id)
    .maybeSingle()
  const contactEmail = (contact as { email?: string } | null)?.email?.toLowerCase() ?? null

  if (sub.user_id) {
    const { data: user } = await supabase.from('users').select('id, email').eq('id', sub.user_id).maybeSingle()
    const u = user as { id: string; email: string } | null
    if (u) return { userId: u.id, email: u.email, keyId: null, via: 'management_token' }
  }
  if (!contactEmail) return null

  const user = await ensureUser(contactEmail)
  await supabase.from('software_submissions').update({ user_id: user.id }).eq('id', sub.id).is('user_id', null)
  return { userId: user.id, email: user.email, keyId: null, via: 'management_token' }
}

/** Identify the caller, or null when no credential is presented or it is invalid. */
export async function authenticate(req: Request): Promise<ApiPrincipal | null> {
  const bearer = bearerToken(req.headers.get('authorization'))
  if (bearer) {
    if (!looksLikeApiKey(bearer)) return null
    return principalFromApiKey(bearer)
  }
  const managementToken = req.headers.get('x-management-token')
  if (managementToken) return resolveManagementToken(managementToken.trim())
  return null
}

export const AUTH_HELP =
  'Authenticate with an API key: Authorization: Bearer sr_… . Create one with `npx @profullstack/saasrow login` or from your listing management page.'

export async function requirePrincipal(req: Request): Promise<ApiPrincipal> {
  const principal = await authenticate(req)
  if (!principal) throw new ApiError(401, `Authentication required. ${AUTH_HELP}`)
  return principal
}

// ---------------------------------------------------------------------------
// API key CRUD

export async function listApiKeys(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('api_keys')
    .select(KEY_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listApiKeys failed: ${error.message}`)
  return ((data ?? []) as unknown as ApiKeyRow[]).map(serializeApiKey)
}

/** Creates a key and returns the plaintext exactly once. */
export async function createApiKey(userId: string, name: unknown) {
  const supabase = getSupabaseAdmin()
  const generated = generateApiKey()
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: userId,
      name: normalizeKeyName(name),
      key_prefix: generated.prefix,
      key_hash: generated.hash,
    })
    .select(KEY_COLUMNS)
    .single()
  if (error) throw new Error(`createApiKey failed: ${error.message}`)
  return { key: serializeApiKey(data as unknown as ApiKeyRow), api_key: generated.raw }
}

export async function renameApiKey(userId: string, keyId: string, name: unknown) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('api_keys')
    .update({ name: normalizeKeyName(name) })
    .eq('id', keyId)
    .eq('user_id', userId)
    .select(KEY_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`renameApiKey failed: ${error.message}`)
  if (!data) throw new ApiError(404, 'No such API key')
  return serializeApiKey(data as unknown as ApiKeyRow)
}

/** Soft delete: the row stays so `last_used_at` history survives. */
export async function revokeApiKey(userId: string, keyId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select(KEY_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`revokeApiKey failed: ${error.message}`)
  if (!data) throw new ApiError(404, 'No such active API key')
  return serializeApiKey(data as unknown as ApiKeyRow)
}

// ---------------------------------------------------------------------------
// CLI login: exchanging an emailed code for a key

/**
 * Check the most recent live code for an email. Every wrong guess counts
 * against the code; five and it is dead, so the 8-character space cannot be
 * walked. Success consumes the code.
 */
export async function redeemLoginCode(email: string, code: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('cli_login_codes')
    .select('id, code_hash, attempts, expires_at')
    .eq('email', email)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`login code lookup failed: ${error.message}`)
  const row = data as { id: string; code_hash: string; attempts: number } | null
  if (!row) throw new ApiError(400, 'No active login code for that email. Run `saasrow login` again to get a new one.')
  if (row.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
    throw new ApiError(429, 'Too many incorrect attempts. Request a new code.')
  }

  if (row.code_hash !== hashLoginCode(email, code)) {
    await supabase.from('cli_login_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id)
    throw new ApiError(401, 'Incorrect code.')
  }

  await supabase
    .from('cli_login_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)
}
