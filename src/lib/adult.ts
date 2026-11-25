import 'server-only'
import { getSupabaseAdmin } from './supabaseAdmin'
import { PUBLIC_COLUMNS, serializeProduct } from './distribution'
import { ApiError } from './publicApi'
import { authenticate, type ApiPrincipal } from './apiAuth'
import { ADULT_SIGN_IN_MESSAGE, ADULT_STATUS } from './adultShared'
import type { Submission } from './submissions'

/**
 * The only readers of adult listings (status 'adult'). Everything here is for
 * a signed-in member or an API key: callers get the principal from
 * requireAdultAccess() first, and there is no anonymous path.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PAGE = 100

/** The signed-in caller, or a 401 that says how to sign in. Never a 404: a member following a link should be told to sign in. */
export async function requireAdultAccess(req: Request): Promise<ApiPrincipal> {
  const principal = await authenticate(req)
  if (!principal) throw new ApiError(401, ADULT_SIGN_IN_MESSAGE)
  return principal
}

/** Headers for every adult response: private, and never indexed. */
export const ADULT_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
}

export interface AdultQuery {
  q?: string
  sort?: 'recent' | 'popular'
  limit?: number
  offset?: number
}

export async function listAdultListings(query: AdultQuery = {}) {
  const limit = Math.min(MAX_PAGE, Math.max(1, Math.floor(Number(query.limit) || 50)))
  const offset = Math.max(0, Math.floor(Number(query.offset) || 0))

  let request = getSupabaseAdmin()
    .from('software_submissions')
    .select(PUBLIC_COLUMNS, { count: 'exact' })
    .eq('status', ADULT_STATUS)

  const q = query.q?.trim()
  if (q) {
    // PostgREST's or() takes a comma list: strip what would break out of it.
    const safe = q.replace(/[,()%*\\]/g, ' ').trim().slice(0, 80)
    if (safe) request = request.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
  }
  request =
    query.sort === 'popular'
      ? request.order('upvotes', { ascending: false }).order('created_at', { ascending: false })
      : request.order('created_at', { ascending: false })

  const { data, count, error } = await request.range(offset, offset + limit - 1)
  if (error) throw new Error(`listAdultListings failed: ${error.message}`)
  const items = ((data ?? []) as unknown as Submission[]).map(serializeProduct)
  const total = count ?? items.length
  return { items, total, limit, offset, next: offset + limit < total ? offset + limit : null }
}

export async function getAdultListing(id: string) {
  if (!UUID.test(id)) return null
  const { data, error } = await getSupabaseAdmin()
    .from('software_submissions')
    .select(PUBLIC_COLUMNS)
    .eq('id', id)
    .eq('status', ADULT_STATUS)
    .maybeSingle()
  if (error) throw new Error(`getAdultListing failed: ${error.message}`)
  return data ? serializeProduct(data as unknown as Submission) : null
}

/** Is this id a live adult listing? Says nothing about it: only that the gated page applies. */
export async function isAdultListing(id: string): Promise<boolean> {
  if (!UUID.test(id)) return false
  const { count, error } = await getSupabaseAdmin()
    .from('software_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('id', id)
    .eq('status', ADULT_STATUS)
  if (error) return false
  return (count ?? 0) > 0
}
