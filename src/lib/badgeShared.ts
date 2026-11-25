// The embeddable "Listed on SaaSRow" badge: the SVG, the copy-paste snippets
// and the test for whether a page links back. Pure, so the server, the manage
// page and the tests share one copy. (Fetching and the database live in
// src/lib/badge.ts.)
//
// A free listing is live only while its website carries this badge, or any
// other link to its SaaSRow page. Featured and Premium listings do not need it.

export const BADGE_W = 200
export const BADGE_H = 44

/** Hosts a backlink may point at: the live site plus the domains that redirect to it. */
export const BADGE_HOSTS = ['saasrow.com', 'saasrow.pwa.pit.world']

export type BadgeTheme = 'dark' | 'light'
export const badgeTheme = (v: unknown): BadgeTheme => (v === 'light' ? 'light' : 'dark')

const THEMES = {
  dark: { bg: '#0a0a0a', stroke: '#3a3a3a', fg: '#ffffff', sub: '#b8b8b8', rule: '#2c2c2c', accent: '#E0FF04' },
  light: { bg: '#ffffff', stroke: '#16211d', fg: '#111111', sub: '#55605b', rule: '#dfe3e0', accent: '#4a6b00' },
} as const

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** 1234 -> "1.2k", 1500000 -> "1.5M". */
export function compact(n: unknown): string {
  const v = Number(n) || 0
  if (v < 1000) return String(v)
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

const SANS = "-apple-system, 'SF Pro Text', 'Helvetica Neue', Roboto, Arial, sans-serif"

// Three rows, the top one lit: the SaaSRow mark, 26px.
const mark = (x: number, y: number) => `<g transform="translate(${x} ${y})">
<rect width="26" height="26" rx="6" fill="#161616"/>
<rect x="5.5" y="6" width="15" height="3.6" rx="1.8" fill="#E0FF04"/>
<rect x="5.5" y="11.2" width="15" height="3.6" rx="1.8" fill="#4FFFE3"/>
<rect x="5.5" y="16.4" width="10" height="3.6" rx="1.8" fill="#ffffff" fill-opacity=".55"/>
</g>`

function frame(t: BadgeTheme, label: string, top: string, right = ''): string {
  const c = THEMES[t]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_W}" height="${BADGE_H}" viewBox="0 0 ${BADGE_W} ${BADGE_H}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<rect x=".5" y=".5" width="${BADGE_W - 1}" height="${BADGE_H - 1}" rx="8" fill="${c.bg}" stroke="${c.stroke}"/>
${mark(9, 9)}
<text x="43" y="18" fill="${c.sub}" font-family="${SANS}" font-size="7.6" letter-spacing=".55">${esc(top)}</text>
<text x="42.6" y="34" fill="${c.fg}" font-family="${SANS}" font-size="16.5" font-weight="700" letter-spacing="-.2">SaaS<tspan fill="${c.accent}">Row</tspan></text>
${right}
</svg>`
}

export interface BadgeListing {
  id: string
  title: string
  upvotes?: number | null
}

/** One listing's badge: its upvotes on the right. */
export function badgeSvg(listing: BadgeListing, t: BadgeTheme = 'dark'): string {
  const c = THEMES[t]
  const votes = Math.max(0, Number(listing.upvotes) || 0)
  const label = `${listing.title} is listed on SaaSRow, ${votes} upvote${votes === 1 ? '' : 's'}`
  const right = `<line x1="145" y1="9" x2="145" y2="35" stroke="${c.rule}"/>
<text x="172.5" y="22" text-anchor="middle" fill="${c.accent}" font-family="${SANS}" font-size="12" font-weight="700">▲ ${esc(compact(votes))}</text>
<text x="172.5" y="33" text-anchor="middle" fill="${c.sub}" font-family="${SANS}" font-size="7.4">upvote${votes === 1 ? '' : 's'}</text>`
  return frame(t, label, 'LISTED ON', right)
}

/** What an unknown or rejected listing id gets: an invitation to list. */
export function listBadgeSvg(t: BadgeTheme = 'dark'): string {
  return frame(t, 'List your software free on SaaSRow', 'LIST YOUR SOFTWARE ON')
}

export interface BadgeSnippet {
  image: string
  html: string
  markdown: string
}

/** The bare host a site URL or domain is about: no scheme, no www, lower case. null when it is not one. */
export function siteHost(site: unknown): string | null {
  const v = String(site ?? '').trim()
  if (!v) return null
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.host.replace(/^www\./, '').toLowerCase() || null
  } catch {
    return null
  }
}

/**
 * Copy-paste snippets for one listing, dark and light.
 *
 * With the listing's URL they are addressed by domain (/for?site=example.com),
 * not by id: the same line then works in a footer shared by many sites, each
 * passing its own domain. Without a URL they fall back to the id form. Both
 * forms verify.
 */
export function badgeSnippets(listing: { id: string; title: string; url?: string | null }, siteUrl: string) {
  const base = siteUrl.replace(/\/+$/, '')
  const page = `${base}/software/${listing.id}`
  const alt = `${listing.title} on SaaSRow`
  const host = siteHost(listing.url)
  const site = host ? encodeURIComponent(host) : null
  const link = site ? `${base}/for?site=${site}` : page
  const one = (t: BadgeTheme): BadgeSnippet => {
    const image = site
      ? `${base}/for.svg?site=${site}${t === 'light' ? '&theme=light' : ''}`
      : `${base}/software/${listing.id}/badge.svg${t === 'light' ? '?theme=light' : ''}`
    return {
      image,
      html: `<a href="${link}"><img src="${esc(image)}" alt="${esc(alt)}" width="${BADGE_W}" height="${BADGE_H}" loading="lazy"></a>`,
      markdown: `[![${alt.replace(/[[\]]/g, '')}](${image})](${link})`,
    }
  }
  return { page, link, alt, dark: one('dark'), light: one('light') }
}

/** The one line for a footer shared by many sites: each site passes its own domain. */
export function siteBadgeHtml(site: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, '')
  const s = encodeURIComponent(siteHost(site) ?? site)
  return `<a href="${base}/for?site=${s}"><img src="${base}/for.svg?site=${s}" alt="Listed on SaaSRow" width="${BADGE_W}" height="${BADGE_H}" loading="lazy"></a>`
}

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Does this HTML link to the listing's SaaSRow page? Two forms count, on any
 * of our hosts:
 *
 *   /software/<id>                  the listing's page (a plain text link is as good as the badge)
 *   /for?site=<the site's domain>   the by-domain badge, as a shared footer writes it
 *
 * The by-domain form only counts when the domain it names is the listing's own
 * (`listingUrl`): a page cannot verify by pointing at somebody else's.
 */
export function linksBack(html: string | null | undefined, id: string, siteUrl?: string, listingUrl?: string | null): boolean {
  if (!html || !id) return false
  const hosts = new Set(BADGE_HOSTS)
  if (siteUrl) {
    try {
      hosts.add(new URL(siteUrl).host.replace(/^www\./, '').toLowerCase())
    } catch {
      // not a URL: the built-in hosts still apply
    }
  }
  const h = [...hosts].map(reEscape).join('|')
  const origin = `href\\s*=\\s*["']?(?:https?:)?//(?:www\\.)?(?:${h})`
  if (new RegExp(`${origin}/software/${reEscape(id)}(?:[/?#"'\\s>]|$)`, 'i').test(html)) return true

  const own = siteHost(listingUrl)
  if (!own) return false
  const bySite = new RegExp(`${origin}/for\\?(?:[^"'\\s>]*?(?:&amp;|&))?site=([^"'\\s>&]+)`, 'gi')
  for (const m of html.matchAll(bySite)) {
    let value = m[1]
    try {
      value = decodeURIComponent(value)
    } catch {
      // not cleanly percent-encoded: compare it as written
    }
    if (siteHost(value) === own) return true
  }
  return false
}

const PAID_TIERS = new Set(['featured', 'premium'])

export interface BadgeColumns {
  status?: string | null
  tier?: string | null
  badge_verified_at?: string | null
  badge_checked_at?: string | null
  badge_grace_until?: string | null
  badge_exempt?: boolean | null
}

export interface BadgeState {
  /** Free and not waived: this listing must carry the badge to be live. */
  required: boolean
  verified: boolean
  verified_at: string | null
  checked_at: string | null
  /** Live without a badge until then (null: no grace running). */
  grace_until: string | null
  /** Approved by an admin, hidden only because the badge is missing. */
  hidden: boolean
}

/** Where a listing stands with the badge rule. Mirrors enforce_free_badge() in the database. */
export function badgeState(row: BadgeColumns, now: Date = new Date()): BadgeState {
  const required = !PAID_TIERS.has(String(row.tier ?? 'free')) && !row.badge_exempt
  const grace = row.badge_grace_until && new Date(row.badge_grace_until) > now ? row.badge_grace_until : null
  return {
    required,
    verified: Boolean(row.badge_verified_at),
    verified_at: row.badge_verified_at ?? null,
    checked_at: row.badge_checked_at ?? null,
    grace_until: required && !row.badge_verified_at ? grace : null,
    hidden: row.status === 'badge_required',
  }
}

/** One line telling the owner what to do next (API, CLI, MCP and the manage page). */
export function badgeAdvice(row: BadgeColumns & { url?: string }, siteUrl: string, now: Date = new Date()): string {
  const s = badgeState(row, now)
  const featured = `${siteUrl.replace(/\/+$/, '')}/featured`
  if (!s.required) return 'This listing does not need the badge.'
  if (s.verified) return 'Badge verified. Keep it on your site: we re-check daily, and removing it hides the listing after 3 days.'
  const where = row.url ? ` on ${row.url}` : ' on your homepage'
  if (s.hidden) return `Your listing is approved but hidden until the badge is${where}. Add the HTML, then check again. Or upgrade to Featured ($2 lifetime) at ${featured}: no badge needed.`
  if (s.grace_until) return `Free listings need the badge${where} by ${s.grace_until.slice(0, 10)}, or the listing is hidden. Featured ($2 lifetime) at ${featured} needs no badge.`
  return `Free listings go live once they are approved and the badge is${where}. Add the HTML now so approval is the only step left. Featured ($2 lifetime) at ${featured} needs no badge.`
}
