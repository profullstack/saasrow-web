// Validation for listings created or edited through the API, the MCP server
// and the CLI. Pure, so it is unit-tested without a database, and shared so
// the three transports cannot disagree about what a valid listing is.
//
// Field names follow the public read shape (`name`, `website`) but the
// storage names (`title`, `url`) are accepted as aliases, since anyone who has
// looked at the website's submit form will reach for those.

import {
  normalizeUseCases,
  normalizeAudiences,
  normalizePlatforms,
  normalizePricingModel,
  normalizeAlternatives,
} from './vocab'

export const LISTING_LIMITS = {
  title: 120,
  description: 2000,
  category: 60,
  tags: 10,
  tag: 40,
  urlLength: 2048,
} as const

export const DEFAULT_CATEGORY = 'Software'

/** What ends up in `software_submissions`. */
export interface ListingFields {
  title: string
  url: string
  description: string
  category: string
  tags: string[]
  use_cases: string[]
  audiences: string[]
  platforms: string[]
  pricing_model: string | null
  alternatives: string[]
}

export type ListingValidation =
  | { ok: true; value: Partial<ListingFields> }
  | { ok: false; errors: string[] }

function pick(body: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (body[name] !== undefined) return body[name]
  }
  return undefined
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.trim().replace(/\s+/g, ' ')
}

/**
 * Same normalisation the website applies (trim, drop trailing slashes) plus
 * the checks the website leaves to the browser's URL input.
 */
export function normalizeListingUrl(value: unknown): { url?: string; error?: string } {
  const raw = asTrimmedString(value)
  if (!raw) return { error: 'website is required' }
  if (raw.length > LISTING_LIMITS.urlLength) return { error: 'website is too long' }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return { error: 'website must be a valid URL' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'website must use http or https' }
  }
  if (!parsed.hostname.includes('.') || parsed.username || parsed.password) {
    return { error: 'website must be a public URL' }
  }
  return { url: parsed.toString().replace(/\/+$/, '') }
}

function normalizeTags(value: unknown): { tags?: string[]; error?: string } {
  if (value === undefined || value === null) return { tags: [] }
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : null
  if (!list) return { error: 'tags must be a list of strings' }
  const seen = new Set<string>()
  const tags: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') return { error: 'tags must be a list of strings' }
    const tag = item.trim().toLowerCase().replace(/\s+/g, '-').slice(0, LISTING_LIMITS.tag)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  if (tags.length > LISTING_LIMITS.tags) {
    return { error: `at most ${LISTING_LIMITS.tags} tags` }
  }
  return { tags }
}

/**
 * Validate a create (every required field present) or an update (`partial`:
 * only the fields supplied are checked). Vocabulary fields silently drop
 * unknown terms rather than rejecting, mirroring the website: a bad tag
 * should never cost someone a submission.
 */
export function validateListingInput(
  input: unknown,
  opts: { partial?: boolean } = {},
): ListingValidation {
  const partial = Boolean(opts.partial)
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['body must be a JSON object'] }
  }
  const body = input as Record<string, unknown>
  const errors: string[] = []
  const value: Partial<ListingFields> = {}

  const title = pick(body, 'name', 'title')
  if (title !== undefined || !partial) {
    const s = asTrimmedString(title)
    if (!s) errors.push('name is required')
    else if (s.length > LISTING_LIMITS.title) {
      errors.push(`name must be at most ${LISTING_LIMITS.title} characters`)
    } else value.title = s
  }

  const website = pick(body, 'website', 'url')
  if (website !== undefined || !partial) {
    const { url, error } = normalizeListingUrl(website)
    if (error) errors.push(error)
    else value.url = url
  }

  const description = pick(body, 'description')
  if (description !== undefined || !partial) {
    const s = typeof description === 'string' ? description.trim() : ''
    if (!s) errors.push('description is required')
    else if (s.length > LISTING_LIMITS.description) {
      errors.push(`description must be at most ${LISTING_LIMITS.description} characters`)
    } else value.description = s
  }

  const category = pick(body, 'category')
  if (category !== undefined) {
    const s = asTrimmedString(category)
    if (!s) errors.push('category must be a non-empty string')
    else if (s.length > LISTING_LIMITS.category) {
      errors.push(`category must be at most ${LISTING_LIMITS.category} characters`)
    } else value.category = s
  } else if (!partial) {
    value.category = DEFAULT_CATEGORY
  }

  const tags = pick(body, 'tags')
  if (tags !== undefined || !partial) {
    const result = normalizeTags(tags)
    if (result.error) errors.push(result.error)
    else value.tags = result.tags
  }

  if (body.use_cases !== undefined || !partial) value.use_cases = normalizeUseCases(body.use_cases)
  if (body.audiences !== undefined || !partial) value.audiences = normalizeAudiences(body.audiences)
  if (body.platforms !== undefined || !partial) value.platforms = normalizePlatforms(body.platforms)
  if (body.pricing_model !== undefined || !partial) {
    value.pricing_model = normalizePricingModel(body.pricing_model)
  }
  if (body.alternatives !== undefined || !partial) {
    value.alternatives = normalizeAlternatives(body.alternatives)
  }

  if (partial && Object.keys(value).length === 0 && errors.length === 0) {
    errors.push('nothing to update')
  }

  return errors.length ? { ok: false, errors } : { ok: true, value }
}
