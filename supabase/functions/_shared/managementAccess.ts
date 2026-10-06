// Resolves which listings and which manage link belong to an email address.
//
// Listings submitted through the website never get `software_submissions.user_id`
// (the `submissions` edge function only writes a `submission_contacts` row), and
// `software_submissions` has no email column at all. So anything that finds a
// person's listings by `user_id` alone, or by `.eq('email', …)`, finds nothing:
// the header "Sign in" answered 404 "No submissions found" for ~90% of
// submitters, and paid tiers were never applied to the payer's listings.
//
// Kept free of Deno/npm imports so vitest can exercise it with a fake client.

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any }

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

/** Trimmed, lower-cased email, or null when it is not a plausible address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  return EMAIL_RE.test(email) ? email : null
}

/** An ILIKE pattern that matches `value` exactly, ignoring case only. */
export function exactIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Ids of every listing tied to `email`, by contact row or by owning user. */
export async function listingIdsForEmail(supabase: Db, rawEmail: string): Promise<string[]> {
  const email = normalizeEmail(rawEmail)
  if (!email) return []
  const pattern = exactIlike(email)
  const ids = new Set<string>()

  const { data: contacts } = await supabase
    .from('submission_contacts')
    .select('submission_id')
    .ilike('email', pattern)
  for (const c of contacts ?? []) if (c.submission_id) ids.add(c.submission_id)

  const { data: users } = await supabase.from('users').select('id').ilike('email', pattern)
  const userIds = (users ?? []).map((u: { id: string }) => u.id)
  if (userIds.length > 0) {
    const { data: owned } = await supabase
      .from('software_submissions')
      .select('id')
      .in('user_id', userIds)
    for (const s of owned ?? []) ids.add(s.id)
  }

  return [...ids]
}

export type ManagementAccess =
  | { kind: 'subscriber'; token: string; userId: string }
  | { kind: 'listing'; token: string; userId: string }
  | { kind: 'none'; userId: string }

/**
 * Finds (or creates) the account for `email`, adopts its unowned listings, and
 * picks the token for its manage link. A paying subscriber gets their
 * `user_tokens` token, the only one the subscription, cancel and renew
 * functions accept; everyone else gets their newest listing's management token.
 */
export async function resolveManagementAccess(supabase: Db, email: string): Promise<ManagementAccess> {
  const pattern = exactIlike(email)

  const { data: existing, error: userError } = await supabase
    .from('users')
    .select('id')
    .ilike('email', pattern)
    .order('created_at', { ascending: true })
    .limit(1)
  if (userError) throw userError

  let userId: string | undefined = existing?.[0]?.id
  if (!userId) {
    const { data: created, error: createError } = await supabase
      .from('users')
      .insert({ email })
      .select('id')
      .single()
    if (createError) throw createError
    userId = created.id as string
  }

  // Adopt website listings submitted under this email (same rule as the
  // API's claimLegacyListings): only rows nobody owns yet.
  const { data: contacts } = await supabase
    .from('submission_contacts')
    .select('submission_id')
    .ilike('email', pattern)
  const contactIds = (contacts ?? []).map((c: { submission_id: string }) => c.submission_id).filter(Boolean)
  if (contactIds.length > 0) {
    const { error: adoptError } = await supabase
      .from('software_submissions')
      .update({ user_id: userId })
      .in('id', contactIds)
      .is('user_id', null)
    if (adoptError) throw adoptError
  }

  const { data: tokens } = await supabase
    .from('user_tokens')
    .select('id, token, user_id')
    .ilike('email', pattern)
    .order('created_at', { ascending: false })
    .limit(1)
  const subscriber = tokens?.[0]
  if (subscriber?.token) {
    if (!subscriber.user_id) {
      const { error: linkError } = await supabase
        .from('user_tokens')
        .update({ user_id: userId })
        .eq('id', subscriber.id)
      if (linkError) throw linkError
    }
    return { kind: 'subscriber', token: subscriber.token, userId }
  }

  const { data: newest } = await supabase
    .from('software_submissions')
    .select('management_token')
    .eq('user_id', userId)
    .not('management_token', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  const token = newest?.[0]?.management_token
  return token ? { kind: 'listing', token, userId } : { kind: 'none', userId }
}

/** The manage page URL for a token; user tokens are base64 and carry `/`. */
export function managementUrlFor(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/manage/${encodeURIComponent(token)}`
}
