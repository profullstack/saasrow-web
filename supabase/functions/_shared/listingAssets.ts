// Everything needed to complete a listing's assets, with no runtime-specific
// imports so it runs in a Deno edge function and in a Node script
// (`node --experimental-strip-types`). Both the `complete-listing` function
// and `scripts/backfill-listing-assets.mjs` build on this file.
//
// Screenshots come from a provider chain. Paid providers go first when their
// key is present; two keyless public services follow so a listing is never
// left without an image just because a subscription lapsed. Adding a paid key
// (SCREENSHOT_API_KEY for ScreenshotOne) makes it the first choice with no
// code change.

export interface ExtractedAssets {
  favicon: string | null
  ogImage: string | null
  /** Same-origin navigation links, homepage excluded, at most `maxNav`. */
  navLinks: Array<{ text: string; href: string }>
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 SaaSRowBot/1.0 (+https://www.saasrow.com)'

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? (m[1] ?? m[2] ?? m[3] ?? '').trim() : null
}

function absolute(href: string, base: string): string | null {
  // Inline icons are common on small sites; fetch() understands data: URLs.
  if (/^data:image\//i.test(href)) return href
  try {
    const u = new URL(href, base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

/** Pull the favicon, og:image and top navigation links out of a page. */
export function extractAssetUrls(html: string, pageUrl: string, maxNav = 4): ExtractedAssets {
  const head = html.slice(0, 200_000)
  let favicon: string | null = null
  let ogImage: string | null = null

  // Prefer a PNG/SVG icon or apple-touch-icon over a .ico, and the largest
  // declared size when several are offered.
  let bestScore = -1
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, 'rel') ?? '').toLowerCase()
    if (!/\b(icon|apple-touch-icon)\b/.test(rel)) continue
    const href = attr(tag, 'href')
    if (!href) continue
    const url = absolute(decodeEntities(href), pageUrl)
    if (!url) continue
    const sizes = attr(tag, 'sizes') ?? ''
    const px = Number.parseInt(sizes, 10) || (rel.includes('apple') ? 180 : 32)
    const type = (attr(tag, 'type') ?? '').toLowerCase()
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
    const isBitmap = type.includes('png') || ext === 'png' || rel.includes('apple')
    const isSvg = type.includes('svg') || ext === 'svg'
    const score = (isBitmap ? 1000 : isSvg ? 900 : 0) + Math.min(px, 512)
    if (score > bestScore) {
      bestScore = score
      favicon = url
    }
  }
  if (!favicon) favicon = absolute('/favicon.ico', pageUrl)

  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase()
    if (key === 'og:image' || key === 'og:image:url' || key === 'og:image:secure_url' || key === 'twitter:image') {
      const content = attr(tag, 'content')
      const url = content ? absolute(decodeEntities(content), pageUrl) : null
      if (url && (!ogImage || key.startsWith('og:image'))) ogImage = url
      if (ogImage && key === 'og:image') break
    }
  }

  const navLinks: Array<{ text: string; href: string }> = []
  const seen = new Set<string>()
  let origin = ''
  try {
    origin = new URL(pageUrl).origin
  } catch {
    // unreachable for a URL that fetched; leave navLinks empty
  }
  const homepage = pageUrl.replace(/\/+$/, '')
  const navBlocks = html.match(/<(?:nav|header)\b[\s\S]*?<\/(?:nav|header)>/gi) ?? []
  for (const block of navBlocks) {
    for (const a of block.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? []) {
      const href = attr(a, 'href')
      if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue
      const url = absolute(decodeEntities(href), pageUrl)
      if (!url || !url.startsWith(origin) || url.includes('#')) continue
      const clean = url.replace(/\/+$/, '')
      if (clean === homepage || seen.has(clean)) continue
      const text = decodeEntities(a.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
      if (!text || text.length > 40) continue
      seen.add(clean)
      navLinks.push({ text, href: url })
      if (navLinks.length >= maxNav) break
    }
    if (navLinks.length >= maxNav) break
  }

  return { favicon, ogImage, navLinks }
}

export interface Fetched {
  bytes: Uint8Array
  contentType: string
}

/** Fetch a URL with a timeout, returning null on any failure. */
export async function fetchBytes(
  url: string,
  opts: { timeoutMs?: number; fetchFn?: typeof fetch; headers?: Record<string, string> } = {},
): Promise<Fetched | null> {
  const { timeoutMs = 15_000, fetchFn = fetch, headers = {} } = opts
  try {
    const res = await fetchFn(url, {
      headers: { 'User-Agent': UA, ...headers },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0) return null
    return { bytes, contentType: (res.headers.get('content-type') ?? '').split(';')[0].trim() }
  } catch {
    return null
  }
}

export async function fetchHtml(url: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const got = await fetchBytes(url, {
    fetchFn,
    timeoutMs: 15_000,
    headers: { Accept: 'text/html,application/xhtml+xml' },
  })
  if (!got || !got.contentType.includes('html')) return null
  return new TextDecoder().decode(got.bytes)
}

/** Is this really an image we can serve? Sniffs the bytes, not the header. */
export function imageKind(bytes: Uint8Array, contentType = ''): 'png' | 'jpg' | 'gif' | 'webp' | 'svg' | 'ico' | null {
  const b = bytes
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  if (b.length > 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  if (b.length > 4 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'ico'
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg'
  if (contentType.includes('svg')) return 'svg'
  return null
}

export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
}

export function storageFileName(kind: string): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${kind}`
}

// ---------------------------------------------------------------------------
// Logo discovery

export interface LogoResult extends Fetched {
  kind: string
  source: string
}

/**
 * Where to look for a logo, in order: what the page declared, the usual
 * well-known paths (relative to the page's own directory first, for sites
 * hosted under a subpath), then two favicon services that keep their own
 * caches and often have an icon for a site that blocks us.
 */
export function logoCandidates(declared: string | null, pageUrl: string): Array<{ url: string; source: string }> {
  const out: Array<{ url: string; source: string }> = []
  const seen = new Set<string>()
  const push = (url: string | null, source: string) => {
    if (url && !seen.has(url)) {
      seen.add(url)
      out.push({ url, source })
    }
  }
  push(declared, 'page')
  let origin = ''
  let host = ''
  let dir = ''
  try {
    const u = new URL(pageUrl)
    origin = u.origin
    host = u.hostname
    dir = u.pathname.endsWith('/') ? u.pathname : u.pathname.replace(/\/[^/]*$/, '/')
  } catch {
    return out
  }
  if (dir && dir !== '/') {
    push(`${origin}${dir}favicon.ico`, 'subpath')
    push(`${origin}${dir}favicon.png`, 'subpath')
  }
  for (const p of ['/favicon.ico', '/favicon.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/favicon.svg', '/icon.png', '/logo.png']) {
    push(`${origin}${p}`, 'well-known')
  }
  push(`https://icons.duckduckgo.com/ip3/${host}.ico`, 'duckduckgo')
  push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`, 'google')
  return out
}

let googlePlaceholder: Promise<string | null> | null = null

/** Google answers every domain; for an unknown one it sends a generic globe we must not store as a logo. */
async function googlePlaceholderHash(fetchFn: typeof fetch): Promise<string | null> {
  if (!googlePlaceholder) {
    googlePlaceholder = (async () => {
      const got = await fetchBytes('https://www.google.com/s2/favicons?domain=no-such-site-3f9a1c.invalid&sz=128', { fetchFn })
      return got ? await sha256Hex(got.bytes) : null
    })()
  }
  return googlePlaceholder
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const MONOGRAM_COLORS = ['#4FFFE3', '#E0FF04', '#FF7A59', '#A78BFA', '#60A5FA', '#F472B6', '#34D399', '#FBBF24']

/**
 * The last resort when a site has no icon anywhere: a monogram of the
 * product's first letter on a colour picked from its domain, as SVG. It is
 * obviously a placeholder, which is the point: a maker who wants their real
 * logo uploads one from the management page and this gets replaced.
 */
export function monogramLogo(title: string | null, pageUrl: string): { bytes: Uint8Array; kind: 'svg' } {
  let host = pageUrl
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, '')
  } catch {
    // keep the raw string
  }
  const letter = (title ?? host).trim().replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 1).toUpperCase() || host.slice(0, 1).toUpperCase() || '?'
  let hash = 0
  for (const ch of host) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  const color = MONOGRAM_COLORS[hash % MONOGRAM_COLORS.length]
  const escaped = letter.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">` +
    `<rect width="256" height="256" rx="48" fill="${color}"/>` +
    `<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" ` +
    `font-family="Ubuntu, 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="700" font-size="150" fill="#171717">${escaped}</text>` +
    `</svg>`
  return { bytes: new TextEncoder().encode(svg), kind: 'svg' }
}

/** Try each candidate until one yields a real image. Tiny (<100 byte) files are tracking pixels, not logos. */
export async function findLogo(
  declared: string | null,
  pageUrl: string,
  fetchFn: typeof fetch = fetch,
  log: (m: string) => void = () => {},
): Promise<LogoResult | null> {
  for (const { url, source } of logoCandidates(declared, pageUrl)) {
    const got = await fetchBytes(url, { fetchFn, timeoutMs: 10_000 })
    const kind = got ? imageKind(got.bytes, got.contentType) : null
    if (!got || !kind || got.bytes.length < 100) continue
    if (source === 'google' && (await sha256Hex(got.bytes)) === (await googlePlaceholderHash(fetchFn))) {
      log(`google favicon service has no icon for ${pageUrl}`)
      continue
    }
    return { ...got, kind, source }
  }
  return null
}

// ---------------------------------------------------------------------------
// Screenshot provider chain

export interface Screenshot extends Fetched {
  provider: string
}

export type ScreenshotProvider = (url: string, fetchFn: typeof fetch) => Promise<Fetched | null>

export function screenshotProviders(env: Record<string, string | undefined>): Array<[string, ScreenshotProvider]> {
  const chain: Array<[string, ScreenshotProvider]> = []

  if (env.SCREENSHOT_API_KEY) {
    chain.push([
      'screenshotone',
      (url, f) =>
        fetchBytes(
          `https://api.screenshotone.com/take?access_key=${encodeURIComponent(env.SCREENSHOT_API_KEY!)}&url=${encodeURIComponent(url)}&viewport_width=1280&viewport_height=800&device_scale_factor=1&format=png&block_ads=true&block_cookie_banners=true&block_trackers=true&cache=false`,
          { fetchFn: f, timeoutMs: 60_000 },
        ),
    ])
  }

  if (env.GETSCREENSHOT_API_KEY) {
    chain.push([
      'rasterwise',
      async (url, f) => {
        const api = `https://api.rasterwise.com/v1/get-screenshot?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(env.GETSCREENSHOT_API_KEY!)}`
        const got = await fetchBytes(api, { fetchFn: f, timeoutMs: 60_000, headers: { Auth: 'allow' } })
        if (!got) return null
        if (got.contentType.includes('json')) {
          try {
            const json = JSON.parse(new TextDecoder().decode(got.bytes))
            if (json?.status === 'success' && json.screenshotImage) {
              return fetchBytes(json.screenshotImage, { fetchFn: f, timeoutMs: 30_000 })
            }
          } catch {
            // fall through
          }
          return null
        }
        return got
      },
    ])
  }

  chain.push([
    'microlink',
    async (url, f) => {
      const api = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&viewport.width=1280&viewport.height=800`
      const got = await fetchBytes(api, { fetchFn: f, timeoutMs: 60_000 })
      if (!got) return null
      try {
        const json = JSON.parse(new TextDecoder().decode(got.bytes))
        const shot = json?.data?.screenshot?.url
        return shot ? fetchBytes(shot, { fetchFn: f, timeoutMs: 30_000 }) : null
      } catch {
        return null
      }
    },
  ])

  chain.push([
    'thum.io',
    (url, f) =>
      fetchBytes(`https://image.thum.io/get/width/1280/crop/800/noanimate/${url}`, {
        fetchFn: f,
        timeoutMs: 60_000,
      }),
  ])

  return chain
}

/**
 * Try each provider in turn until one returns a real image. Returns null
 * only when every provider failed, with the reasons logged by the caller.
 */
export async function captureScreenshot(
  url: string,
  env: Record<string, string | undefined>,
  opts: { fetchFn?: typeof fetch; providers?: Array<[string, ScreenshotProvider]>; log?: (m: string) => void } = {},
): Promise<Screenshot | null> {
  const { fetchFn = fetch, providers = screenshotProviders(env), log = () => {} } = opts
  for (const [name, provider] of providers) {
    try {
      const got = await provider(url, fetchFn)
      const kind = got ? imageKind(got.bytes, got.contentType) : null
      if (got && kind && kind !== 'svg' && kind !== 'ico' && got.bytes.length > 2_000) {
        return { ...got, contentType: IMAGE_CONTENT_TYPES[kind], provider: name }
      }
      log(`${name}: no usable image for ${url}`)
    } catch (error) {
      log(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return null
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page'
}

// ---------------------------------------------------------------------------
// Completing one listing

export interface ListingRow {
  id: string
  url: string
  title: string | null
  tier: string | null
  logo: string | null
  image: string | null
}

export interface CompletionResult {
  id: string
  title: string | null
  logo: 'kept' | 'added' | 'none'
  image: 'kept' | 'added' | 'from-screenshot' | 'none'
  screenshots: number
  provider: string | null
  notes: string[]
}

export interface CompletionOptions {
  /** How to take a screenshot; the edge function uses the provider chain, the backfill uses Chrome. */
  screenshot: (url: string) => Promise<Screenshot | null>
  fetchFn?: typeof fetch
  /** Pages beyond the homepage for paid tiers. */
  maxNavPages?: number
  log?: (message: string) => void
}

/** The subset of the supabase-js client this needs; typed loosely so the file has no runtime imports. */
// deno-lint-ignore no-explicit-any
type Db = any

async function uploadImage(db: Db, bucket: string, bytes: Uint8Array, contentType: string, fileName: string): Promise<boolean> {
  const { error } = await db.storage.from(bucket).upload(fileName, bytes, { contentType, cacheControl: '3600', upsert: false })
  return !error
}

/**
 * Fill whatever is missing on a listing: favicon → logo, og:image → image,
 * and a screenshot gallery (homepage for everyone, top nav pages as well
 * for featured/premium). If there is no og:image the homepage screenshot
 * becomes the image, so every approved listing ends up with a picture.
 * Always stamps `assets_checked_at`, even when nothing could be found.
 */
export async function completeListingAssets(db: Db, row: ListingRow, opts: CompletionOptions): Promise<CompletionResult> {
  const { screenshot, fetchFn = fetch, maxNavPages = 3, log = () => {} } = opts
  const notes: string[] = []
  const result: CompletionResult = {
    id: row.id,
    title: row.title,
    logo: row.logo ? 'kept' : 'none',
    image: row.image ? 'kept' : 'none',
    screenshots: 0,
    provider: null,
    notes,
  }
  const paid = row.tier === 'featured' || row.tier === 'premium'
  const updates: Record<string, unknown> = {}

  const { count } = await db
    .from('submission_screenshots')
    .select('id', { count: 'exact', head: true })
    .eq('submission_id', row.id)
  const existingShots = count ?? 0
  const needLogo = !row.logo
  const needImage = !row.image
  const needShots = existingShots === 0

  if (needLogo || needImage || needShots) {
    const html = await fetchHtml(row.url, fetchFn)
    if (!html) notes.push('page did not return HTML')
    const assets = html
      ? extractAssetUrls(html, row.url, maxNavPages)
      : { favicon: absolute('/favicon.ico', row.url), ogImage: null, navLinks: [] }

    if (needLogo) {
      const found = await findLogo(assets.favicon, row.url, fetchFn, log)
      const logo = found ?? { ...monogramLogo(row.title, row.url), source: 'monogram' }
      const name = storageFileName(logo.kind)
      if (await uploadImage(db, 'software-logos', logo.bytes, IMAGE_CONTENT_TYPES[logo.kind], name)) {
        updates.logo = name
        result.logo = 'added'
        notes.push(`logo from ${logo.source}`)
      } else notes.push('logo upload failed')
    }

    if (needImage && assets.ogImage) {
      const got = await fetchBytes(assets.ogImage, { fetchFn })
      const kind = got ? imageKind(got.bytes, got.contentType) : null
      if (got && kind && kind !== 'svg' && kind !== 'ico') {
        const name = storageFileName(kind)
        if (await uploadImage(db, 'software-images', got.bytes, IMAGE_CONTENT_TYPES[kind], name)) {
          updates.image = name
          result.image = 'added'
        } else notes.push('image upload failed')
      } else notes.push(`no usable og:image at ${assets.ogImage}`)
    }

    if (needShots) {
      const pages = [{ text: 'Home', href: row.url }, ...(paid ? assets.navLinks : [])]
      let homepage: Screenshot | null = null
      for (const page of pages) {
        const shot = await screenshot(page.href)
        if (!shot) {
          notes.push(`screenshot failed for ${page.href}`)
          if (page.href === row.url) break // if the homepage fails, subpages will too
          continue
        }
        const ext = shot.contentType === 'image/jpeg' ? 'jpg' : 'png'
        const fileName = `${row.id}/${Date.now()}-${slugify(page.text)}.${ext}`
        if (!(await uploadImage(db, 'submission-screenshots', shot.bytes, shot.contentType, fileName))) {
          notes.push(`screenshot upload failed for ${page.href}`)
          continue
        }
        const { data: pub } = db.storage.from('submission-screenshots').getPublicUrl(fileName)
        const { error } = await db.from('submission_screenshots').insert({
          submission_id: row.id,
          screenshot_url: pub.publicUrl,
          page_url: page.href,
          page_title: page.text,
          storage_path: fileName,
        })
        if (error) {
          notes.push(`screenshot row insert failed: ${error.message}`)
          continue
        }
        result.screenshots++
        result.provider = shot.provider
        if (!homepage) homepage = shot
        log(`${row.title ?? row.id}: screenshot of ${page.href} via ${shot.provider}`)
      }

      if (needImage && !updates.image && homepage) {
        const ext = homepage.contentType === 'image/jpeg' ? 'jpg' : 'png'
        const name = storageFileName(ext)
        if (await uploadImage(db, 'software-images', homepage.bytes, homepage.contentType, name)) {
          updates.image = name
          result.image = 'from-screenshot'
        }
      }
    }
  } else {
    notes.push('nothing missing')
  }

  updates.assets_checked_at = new Date().toISOString()
  const { error } = await db.from('software_submissions').update(updates).eq('id', row.id)
  if (error) notes.push(`update failed: ${error.message}`)
  return result
}
