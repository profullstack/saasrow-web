import 'server-only'
import { getSupabaseAdmin } from './supabaseAdmin'
import type { Submission } from './submissions'
import { siteUrl } from './structuredData'
import { attributeClient, type ReadChannel } from './aiClients'

// Shared server-side query layer. The public REST API, the MCP server and the
// llms.txt routes are three different transports over exactly this code, so
// they can never drift out of sync on what "an approved listing" means.

export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 25

export interface ProductQuery {
  q?: string
  category?: string
  useCase?: string
  audience?: string
  platform?: string
  pricingModel?: string
  alternativeTo?: string
  tag?: string
  sort?: 'recent' | 'popular' | 'views'
  limit?: number
  offset?: number
}

export interface ProductPage {
  items: Submission[]
  total: number
  limit: number
  offset: number
}

/** Columns we are willing to publish. Never `select('*')` on a public surface. */
export const PUBLIC_COLUMNS = [
  'id',
  'title',
  'url',
  'description',
  'category',
  'tags',
  'logo',
  'image',
  'use_cases',
  'audiences',
  'platforms',
  'pricing_model',
  'alternatives',
  'upvotes',
  'downvotes',
  'view_count',
  'featured',
  'created_at',
  'updated_at',
].join(', ')

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit < 1) return DEFAULT_PAGE_SIZE
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE)
}

function clampOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset) || !offset || offset < 0) return 0
  return Math.floor(offset)
}

/**
 * PostgREST's `or=` filter takes a comma-separated list, so a user-supplied
 * search term containing a comma or a paren would break out of the expression.
 * Strip the structural characters rather than trying to escape them.
 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()*\\]/g, ' ').trim().slice(0, 120)
}

export async function queryProducts(query: ProductQuery): Promise<ProductPage> {
  const supabase = getSupabaseAdmin()
  const limit = clampLimit(query.limit)
  const offset = clampOffset(query.offset)

  let builder = supabase
    .from('software_submissions')
    .select(PUBLIC_COLUMNS, { count: 'exact' })
    .eq('status', 'approved')

  if (query.q) {
    const term = sanitizeSearchTerm(query.q)
    if (term) {
      builder = builder.or(`title.ilike.%${term}%,description.ilike.%${term}%`)
    }
  }
  if (query.category) {
    builder = builder.ilike('category', query.category)
  }
  if (query.tag) {
    builder = builder.contains('tags', [query.tag])
  }
  if (query.useCase) {
    builder = builder.contains('use_cases', [query.useCase])
  }
  if (query.audience) {
    builder = builder.contains('audiences', [query.audience])
  }
  if (query.platform) {
    builder = builder.contains('platforms', [query.platform])
  }
  if (query.pricingModel) {
    builder = builder.eq('pricing_model', query.pricingModel)
  }
  if (query.alternativeTo) {
    // Matches the generated lowercase mirror column, so casing never matters.
    builder = builder.contains('alternatives_lc', [query.alternativeTo.toLowerCase()])
  }

  switch (query.sort) {
    case 'popular':
      builder = builder.order('upvotes', { ascending: false, nullsFirst: false })
      break
    case 'views':
      builder = builder.order('view_count', { ascending: false, nullsFirst: false })
      break
    default:
      builder = builder.order('created_at', { ascending: false, nullsFirst: false })
  }

  const { data, error, count } = await builder.range(offset, offset + limit - 1)
  if (error) throw new Error(`queryProducts failed: ${error.message}`)

  return {
    items: (data ?? []) as unknown as Submission[],
    total: count ?? 0,
    limit,
    offset,
  }
}

/**
 * Every approved listing, for the bulk exports (llms-full.txt, sitemap-style
 * dumps). Pages through in chunks because PostgREST caps a single response,
 * and guards against an unbounded loop if the directory ever grows large.
 */
export async function getAllApproved(maxRows = 5000): Promise<Submission[]> {
  const supabase = getSupabaseAdmin()
  const chunk = 1000
  const all: Submission[] = []

  for (let offset = 0; offset < maxRows; offset += chunk) {
    const { data, error } = await supabase
      .from('software_submissions')
      .select(PUBLIC_COLUMNS)
      .eq('status', 'approved')
      .order('category', { ascending: true, nullsFirst: false })
      .order('title', { ascending: true })
      .range(offset, offset + chunk - 1)
    if (error) throw new Error(`getAllApproved failed: ${error.message}`)
    const rows = (data ?? []) as unknown as Submission[]
    all.push(...rows)
    if (rows.length < chunk) break
  }
  return all
}

export async function getProduct(id: string): Promise<Submission | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('software_submissions')
    .select(PUBLIC_COLUMNS)
    .eq('id', id)
    .eq('status', 'approved')
    .maybeSingle()
  if (error) throw new Error(`getProduct failed: ${error.message}`)
  return (data as unknown as Submission) ?? null
}

export async function listCategories(): Promise<Array<{ name: string; count: number }>> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('software_submissions')
    .select('category')
    .eq('status', 'approved')
    .not('category', 'is', null)
  if (error) throw new Error(`listCategories failed: ${error.message}`)

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ category: string | null }>) {
    if (!row.category) continue
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
  }
  return Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  )
}

/**
 * The public JSON shape for a listing. Kept separate from the DB row so we can
 * change storage without breaking API consumers, and so image paths come back
 * as absolute URLs an agent can actually fetch.
 */
export function serializeProduct(submission: Submission) {
  const base = siteUrl()
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const asset = (bucket: string, path?: string) =>
    path && supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}` : null

  return {
    id: submission.id,
    name: submission.title,
    description: submission.description,
    website: submission.url,
    saasrow_url: `${base}/software/${submission.id}`,
    category: submission.category ?? null,
    tags: submission.tags ?? [],
    use_cases: submission.use_cases ?? [],
    audiences: submission.audiences ?? [],
    platforms: submission.platforms ?? [],
    pricing_model: submission.pricing_model ?? null,
    alternatives: submission.alternatives ?? [],
    logo_url: asset('software-logos', submission.logo),
    image_url: asset('software-images', submission.image),
    upvotes: submission.upvotes ?? 0,
    downvotes: submission.downvotes ?? 0,
    views: submission.view_count ?? 0,
    featured: Boolean(submission.featured),
    created_at: submission.created_at ?? null,
    updated_at: submission.updated_at ?? null,
  }
}

/**
 * Record a read from an AI client. Fire-and-forget: a stats write must never
 * fail the request that triggered it, so every error is swallowed.
 */
export async function recordAiRead(opts: {
  userAgent: string | null | undefined
  channel: ReadChannel
  path?: string
  submissionId?: string
}): Promise<void> {
  const attributed = attributeClient(opts.userAgent, opts.channel)
  if (!attributed) return
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('ai_reads').insert({
      bot: attributed.bot,
      channel: attributed.channel,
      path: opts.path ?? null,
      submission_id: opts.submissionId ?? null,
    })
  } catch {
    // Intentionally ignored — telemetry is never worth a 500.
  }
}

export interface DistributionStats {
  listings: number
  aiReadsLast30Days: number
  distinctBotsLast30Days: number
  upvotes: number
  views: number
  categories: number
}

export async function getDistributionStats(): Promise<DistributionStats> {
  const supabase = getSupabaseAdmin()

  const [listingsRes, readsRes, totalsRes] = await Promise.all([
    supabase
      .from('software_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved'),
    supabase.from('ai_reads_30d').select('reads, bots').maybeSingle(),
    supabase
      .from('software_submissions')
      .select('upvotes, view_count, category')
      .eq('status', 'approved'),
  ])

  const rows = (totalsRes.data ?? []) as Array<{
    upvotes: number | null
    view_count: number | null
    category: string | null
  }>

  return {
    listings: listingsRes.count ?? 0,
    aiReadsLast30Days: (readsRes.data as { reads?: number } | null)?.reads ?? 0,
    distinctBotsLast30Days: (readsRes.data as { bots?: number } | null)?.bots ?? 0,
    upvotes: rows.reduce((sum, r) => sum + (r.upvotes ?? 0), 0),
    views: rows.reduce((sum, r) => sum + (r.view_count ?? 0), 0),
    categories: new Set(rows.map((r) => r.category).filter(Boolean)).size,
  }
}
