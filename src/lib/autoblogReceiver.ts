import { timingSafeEqual } from 'node:crypto'
import { getHeader, verifyAndParse, type HeaderBag } from '@profullstack/webhooks'

// The crawlproof autoblog posts new blog posts to /api/autoblog-webhook. Its
// sender (@profullstack/autoblog sendWebhook) sends the shared secret as
// `Authorization: Bearer <secret>` and signs Standard Webhooks style
// (`webhook-signature: v1,<base64 HMAC of "id.timestamp.body">`) keyed with
// the secret string's UTF-8 bytes, whatever it looks like.
//
// @profullstack/webhooks verifies the same headers, but it would decode a
// `whsec_…` secret as base64 and so compute a different key. Passing the
// secret as bytes keeps the key exactly what the sender uses for any secret
// format (today's is 64 hex characters). The bearer check and the post
// envelope check are kept from the old receiver.

export interface AutoblogPost {
  id: string
  title: string
  slug: string
  html: string
  status: string
  published_at: string
  tags: string[]
  categories: string[]
  excerpt?: string
  markdown?: string
  url?: string
  canonical_url?: string
  updated_at?: string
  author?: { name?: string; url?: string }
  featured_image?: { url?: string; alt?: string }
}

export type AutoblogResult =
  | { ok: true; post: AutoblogPost; event: Record<string, unknown> }
  | { ok: false; status: 400 | 401; reason: string }

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function isPost(p: unknown): p is AutoblogPost {
  if (!p || typeof p !== 'object') return false
  const o = p as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.slug === 'string' &&
    typeof o.html === 'string' &&
    typeof o.status === 'string' &&
    typeof o.published_at === 'string' &&
    Array.isArray(o.tags) &&
    Array.isArray(o.categories)
  )
}

export function verifyAutoblog(input: {
  headers: HeaderBag
  body: string
  secret: string
  now?: () => number
}): AutoblogResult {
  const { headers, body, secret, now } = input
  if (!secret) return { ok: false, status: 401, reason: 'no secret configured' }
  const bearer = (getHeader(headers, 'authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!bearer || !sameString(bearer, secret)) return { ok: false, status: 401, reason: 'invalid bearer' }

  const parsed = verifyAndParse<Record<string, unknown>>({
    headers,
    body,
    secret: Buffer.from(secret, 'utf8'),
    ...(now ? { now } : {}),
  })
  if (!parsed.ok) return { ok: false, status: parsed.status, reason: parsed.reason }

  const event = parsed.event
  const data = event.data as Record<string, unknown> | undefined
  if (
    event.specversion !== '1.0' ||
    typeof event.id !== 'string' ||
    typeof event.type !== 'string' ||
    typeof event.source !== 'string' ||
    !data ||
    typeof data !== 'object' ||
    !isPost(data.post)
  ) {
    return { ok: false, status: 400, reason: 'invalid event envelope' }
  }
  return { ok: true, post: data.post, event }
}
