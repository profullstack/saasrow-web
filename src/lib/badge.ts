import 'server-only'
import { getSupabaseAdmin } from './supabaseAdmin'
import { siteUrl } from './structuredData'
import { safeFetch, type SafeFetch } from './safeFetch'
import { BADGE_HOSTS, badgeAdvice, badgeSnippets, badgeState, linksBack, siteHost, type BadgeColumns, type BadgeListing } from './badgeShared'
import { fetchOwned } from './listings'
import type { ApiPrincipal } from './apiAuth'

/**
 * The backlink check behind the free tier's badge rule.
 *
 * A free listing is live only while its website links to its SaaSRow page. The
 * database decides what that means for the listing's status (the
 * enforce_free_badge trigger, migration 20261125120000); this module only
 * fetches the site and records whether the link is there:
 *
 *   found            badge_verified_at is set (kept if it already was)
 *   page read, none  badge_verified_at is cleared: the trigger starts 3 days' grace
 *   site unreachable nothing changes but badge_checked_at: an outage on their
 *                    side never costs them the listing
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The listing a badge image is for, in any state but rejected. null draws the "list your software" badge. */
export async function badgeListing(id: string): Promise<BadgeListing | null> {
  if (!UUID.test(id)) return null
  const { data } = await getSupabaseAdmin()
    .from('software_submissions')
    .select('id, title, upvotes, status')
    .eq('id', id)
    .maybeSingle()
  const row = data as (BadgeListing & { status: string }) | null
  // A pending listing gets its real badge: the owner has to place it before going live.
  return row && row.status !== 'rejected' ? row : null
}

const STATUS_RANK: Record<string, number> = { approved: 0, adult: 0, badge_required: 1, pending: 2 }

/**
 * The listing for a site, by its domain: what /for.svg?site= and /for?site=
 * resolve. `www.` is the same site. With several listings on one host, the one
 * at the site root wins, then live ones, then the most upvoted. Rejected
 * listings never match.
 */
export async function badgeListingBySite(site: string): Promise<(BadgeListing & { status: string; url: string }) | null> {
  const host = siteHost(site)
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/.test(host)) return null
  const like = ['https://', 'https://www.', 'http://', 'http://www.'].map((p) => `url.ilike.${p}${host}*`).join(',')
  const { data } = await getSupabaseAdmin()
    .from('software_submissions')
    .select('id, title, upvotes, status, url')
    .or(like)
    .neq('status', 'rejected')
    .limit(50)
  const rows = ((data ?? []) as Array<BadgeListing & { status: string; url: string }>).filter((r) => siteHost(r.url) === host)
  if (rows.length === 0) return null
  const atRoot = (url: string) => {
    try {
      return new URL(url).pathname.replace(/\/+$/, '') === '' ? 0 : 1
    } catch {
      return 1
    }
  }
  rows.sort(
    (a, b) =>
      atRoot(a.url) - atRoot(b.url) ||
      (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) ||
      (Number(b.upvotes) || 0) - (Number(a.upvotes) || 0),
  )
  return rows[0]
}

export interface BadgeCheckRow {
  id: string
  url: string
  badge_verified_at?: string | null
}

export interface BadgeCheckResult {
  verified: boolean
  /** The page the link was found on. */
  found_on: string | null
  /** Pages fetched. */
  looked: string[]
  /** False when no page could be read: the previous answer stands. */
  reachable: boolean
  verified_at: string | null
  checked_at: string | null
  status: string | null
}

/** The listing's URL and its site root: where a footer badge would be. */
export function pagesToCheck(url: string, site = siteUrl()): string[] {
  try {
    const u = new URL(url)
    // A listing whose URL is SaaSRow itself would "link back" through our own
    // pages (every listing page names itself in its canonical link).
    const ours = new Set(BADGE_HOSTS)
    try {
      ours.add(new URL(site).host.replace(/^www\./, '').toLowerCase())
    } catch {
      // not a URL: the built-in hosts still apply
    }
    if (ours.has(u.host.replace(/^www\./, '').toLowerCase())) return []
    return [...new Set([u.href, `${u.origin}/`])]
  } catch {
    return [url] // the submitted URL is all we have
  }
}

export async function checkBadge(
  row: BadgeCheckRow,
  { fetchFn = safeFetch, site = siteUrl() }: { fetchFn?: SafeFetch; site?: string } = {},
): Promise<BadgeCheckResult> {
  const looked = pagesToCheck(row.url, site)
  let found: string | null = null
  let reachable = false
  for (const page of looked) {
    try {
      const res = await fetchFn(page, { accept: 'text/html' })
      if (res.status >= 400) continue
      reachable = true
      if (linksBack(res.text, row.id, site, row.url)) {
        found = page
        break
      }
    } catch {
      // unreachable or refused: try the next page
    }
  }

  const now = new Date().toISOString()
  const patch: Record<string, string | null> = { badge_checked_at: now }
  if (found) patch.badge_verified_at = row.badge_verified_at ?? now
  else if (reachable) patch.badge_verified_at = null

  const { data, error } = await getSupabaseAdmin()
    .from('software_submissions')
    .update(patch)
    .eq('id', row.id)
    .select('status, badge_verified_at, badge_checked_at')
    .maybeSingle()
  if (error) throw new Error(`checkBadge failed: ${error.message}`)
  const after = data as { status: string; badge_verified_at: string | null; badge_checked_at: string | null } | null

  return {
    verified: Boolean(after?.badge_verified_at),
    found_on: found,
    looked,
    reachable,
    verified_at: after?.badge_verified_at ?? null,
    checked_at: after?.badge_checked_at ?? null,
    status: after?.status ?? null,
  }
}

/** One turn of the background checker: the listings most overdue a look. */
export async function runBadgeChecks({ batch = 8 }: { batch?: number } = {}): Promise<{ checked: number; verified: number }> {
  const { data, error } = await getSupabaseAdmin().rpc('badge_checks_due', { batch })
  if (error) throw new Error(`badge_checks_due failed: ${error.message}`)
  const due = (data ?? []) as BadgeCheckRow[]
  let verified = 0
  await Promise.all(
    due.map(async (row) => {
      const r = await checkBadge(row).catch((err) => {
        console.error(`[badge] ${row.id}: ${(err as Error).message}`)
        return null
      })
      if (r?.verified) verified++
    }),
  )
  return { checked: due.length, verified }
}

let timer: ReturnType<typeof setInterval> | null = null
let running = false

/** Start the checker (instrumentation.ts, once per server). BADGE_CHECK=off disables it. */
export function startBadgeChecks(intervalMs = 60_000): void {
  if (timer || process.env.BADGE_CHECK === 'off') return
  timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      const r = await runBadgeChecks()
      if (r.checked) console.log(`[badge] checked ${r.checked}, verified ${r.verified}`)
    } catch (err) {
      console.error(`[badge] ${(err as Error).message}`)
    } finally {
      running = false
    }
  }, intervalMs)
  timer.unref?.()
}

type OwnedBadgeRow = BadgeColumns & { id: string; title: string; url: string }

/** Everything an owner needs to place the badge: state, snippets and what to do next. */
export function badgePayload(row: OwnedBadgeRow, site = siteUrl()) {
  const snip = badgeSnippets(row, site)
  return {
    listing_id: row.id,
    url: row.url,
    status: row.status ?? null,
    ...badgeState(row),
    page: snip.page,
    image: snip.dark.image,
    image_light: snip.light.image,
    html: snip.dark.html,
    html_light: snip.light.html,
    markdown: snip.dark.markdown,
    how: badgeAdvice(row, site),
  }
}

export async function getOwnedBadge(principal: ApiPrincipal, id: string) {
  return badgePayload(await fetchOwned(principal, id))
}

/** Fetch the owner's site now instead of waiting for the checker's turn. */
export async function checkOwnedBadge(principal: ApiPrincipal, id: string) {
  const row = await fetchOwned(principal, id)
  const r = await checkBadge(row)
  return {
    ...badgePayload({ ...row, status: r.status ?? row.status, badge_verified_at: r.verified_at, badge_checked_at: r.checked_at }),
    found_on: r.found_on,
    looked: r.looked,
    reachable: r.reachable,
  }
}
