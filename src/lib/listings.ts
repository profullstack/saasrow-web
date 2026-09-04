import 'server-only'
import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from './supabaseAdmin'
import { ApiError } from './publicApi'
import { PUBLIC_COLUMNS, serializeProduct } from './distribution'
import { validateListingInput, type ListingFields } from './listingInput'
import { callEdgeFunction } from './edgeProxy'
import { siteUrl } from './structuredData'
import type { Submission } from './submissions'
import type { ApiPrincipal } from './apiAuth'

// Owned-listing operations behind the authenticated API, the MCP write tools
// and the CLI. Everything here is scoped to the caller's user id; a listing
// someone else owns is indistinguishable from one that does not exist.

/** How many not-yet-approved listings one account may hold. Spam brake. */
export const MAX_PENDING_LISTINGS = 25

const OWNED_COLUMNS = `${PUBLIC_COLUMNS}, status, tier, expires_at, management_token, submitted_at`

type OwnedRow = Submission & {
  status: string
  tier?: string | null
  expires_at?: string | null
  management_token?: string | null
  submitted_at?: string | null
}

/** The public product shape plus the owner-only fields. */
export function serializeOwnedListing(row: OwnedRow) {
  const base = siteUrl()
  return {
    ...serializeProduct(row),
    status: row.status,
    tier: row.tier ?? 'free',
    expires_at: row.expires_at ?? null,
    submitted_at: row.submitted_at ?? row.created_at ?? null,
    manage_url: row.management_token ? `${base}/manage/${encodeURIComponent(row.management_token)}` : null,
  }
}

/**
 * Website submissions predating the API were inserted without `user_id` and
 * only carry the submitter's email in `submission_contacts`. Adopt those the
 * first time their owner shows up, so the CLI lists everything they made.
 */
export async function claimLegacyListings(principal: ApiPrincipal): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data: contacts } = await supabase
    .from('submission_contacts')
    .select('submission_id')
    .eq('email', principal.email)
  const ids = ((contacts ?? []) as Array<{ submission_id: string }>).map((c) => c.submission_id)
  if (ids.length === 0) return
  await supabase
    .from('software_submissions')
    .update({ user_id: principal.userId })
    .in('id', ids)
    .is('user_id', null)
}

export async function listOwnedListings(principal: ApiPrincipal) {
  await claimLegacyListings(principal)
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('software_submissions')
    .select(OWNED_COLUMNS)
    .eq('user_id', principal.userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listOwnedListings failed: ${error.message}`)
  return ((data ?? []) as unknown as OwnedRow[]).map(serializeOwnedListing)
}

async function fetchOwned(principal: ApiPrincipal, id: string): Promise<OwnedRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'No such listing')
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('software_submissions')
    .select(OWNED_COLUMNS)
    .eq('id', id)
    .eq('user_id', principal.userId)
    .maybeSingle()
  if (error) throw new Error(`getOwnedListing failed: ${error.message}`)
  if (!data) throw new ApiError(404, 'No such listing')
  return data as unknown as OwnedRow
}

export async function getOwnedListing(principal: ApiPrincipal, id: string) {
  await claimLegacyListings(principal)
  return serializeOwnedListing(await fetchOwned(principal, id))
}

async function assertUrlFree(url: string, exceptId?: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  let query = supabase.from('software_submissions').select('id, title, status').eq('url', url)
  if (exceptId) query = query.neq('id', exceptId)
  const { data } = await query.maybeSingle()
  if (data) {
    const existing = data as { title: string; status: string }
    throw new ApiError(409, `This website is already listed: "${existing.title}" (${existing.status})`)
  }
}

/**
 * Same outcome as the website's submit form: a pending free listing, a
 * contact row so the admin tools can reach the maker, and an admin
 * notification. The management token is minted here too, so the listing is
 * reachable from the web UI as well as the API.
 */
export async function createListing(principal: ApiPrincipal, input: unknown) {
  const validation = validateListingInput(input)
  if (!validation.ok) throw new ApiError(400, validation.errors.join('; '))
  const fields = validation.value as ListingFields

  const supabase = getSupabaseAdmin()
  const { count } = await supabase
    .from('software_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', principal.userId)
    .eq('status', 'pending')
  if ((count ?? 0) >= MAX_PENDING_LISTINGS) {
    throw new ApiError(429, `You already have ${MAX_PENDING_LISTINGS} listings awaiting review.`)
  }

  await assertUrlFree(fields.url)

  const { data, error } = await supabase
    .from('software_submissions')
    .insert({
      ...fields,
      status: 'pending',
      tier: 'free',
      user_id: principal.userId,
      management_token: randomUUID(),
    })
    .select(OWNED_COLUMNS)
    .single()
  if (error) {
    if (error.code === '23505') await assertUrlFree(fields.url)
    throw new Error(`createListing failed: ${error.message}`)
  }
  const row = data as unknown as OwnedRow

  const { error: contactError } = await supabase
    .from('submission_contacts')
    .insert({ submission_id: row.id, email: principal.email })
  if (contactError) console.error('[listings] contact insert failed', contactError.message)

  void callEdgeFunction('send-admin-notification', {
    type: 'new_submission',
    data: { title: row.title, url: row.url, category: row.category, email: principal.email },
  }).catch((err) => console.error('[listings] admin notification failed', err))

  return serializeOwnedListing(row)
}

export async function updateOwnedListing(principal: ApiPrincipal, id: string, input: unknown) {
  const validation = validateListingInput(input, { partial: true })
  if (!validation.ok) throw new ApiError(400, validation.errors.join('; '))
  const patch = validation.value

  await fetchOwned(principal, id)
  if (patch.url) await assertUrlFree(patch.url, id)

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('software_submissions')
    .update(patch)
    .eq('id', id)
    .eq('user_id', principal.userId)
    .select(OWNED_COLUMNS)
    .single()
  if (error) throw new Error(`updateOwnedListing failed: ${error.message}`)
  return serializeOwnedListing(data as unknown as OwnedRow)
}

export async function deleteOwnedListing(principal: ApiPrincipal, id: string): Promise<void> {
  await fetchOwned(principal, id)
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('software_submissions')
    .delete()
    .eq('id', id)
    .eq('user_id', principal.userId)
  if (error) throw new Error(`deleteOwnedListing failed: ${error.message}`)
}
