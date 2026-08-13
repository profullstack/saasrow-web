// Controlled vocabularies for the submissions edge function.
//
// This duplicates the term lists in src/lib/vocab.ts because Deno edge
// functions cannot import from the Next.js source tree. The duplication is
// guarded by __tests__/lib/vocabDrift.test.ts, which parses both files and
// fails if the lists ever diverge -- update both, or the test will tell you.

export const USE_CASES = [
  'analytics',
  'automation',
  'collaboration',
  'content-creation',
  'crm',
  'customer-support',
  'data-management',
  'design',
  'developer-tools',
  'e-commerce',
  'education',
  'finance',
  'hr',
  'marketing',
  'monitoring',
  'productivity',
  'project-management',
  'sales',
  'security',
  'seo',
  'social-media',
  'testing',
  'video',
  'writing',
]

export const AUDIENCES = [
  'agencies',
  'designers',
  'developers',
  'educators',
  'enterprises',
  'freelancers',
  'marketers',
  'non-technical',
  'product-managers',
  'sales-teams',
  'startups',
  'small-business',
]

export const PLATFORMS = [
  'android',
  'api',
  'browser-extension',
  'cli',
  'desktop',
  'ios',
  'linux',
  'macos',
  'mcp',
  'self-hosted',
  'web',
  'windows',
]

export const PRICING_MODELS = [
  'free',
  'freemium',
  'one-time',
  'open-source',
  'paid',
  'subscription',
  'usage-based',
]

/**
 * Keep only terms that are actually in the vocabulary. The submissions
 * endpoint is publicly callable, so client-side validation is a convenience,
 * not a guarantee -- anything unrecognised is dropped here rather than stored.
 */
export function filterToVocabulary(value: unknown, allowed: string[], max: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const term = entry.trim().toLowerCase()
    if (allowed.includes(term) && !out.includes(term)) out.push(term)
    if (out.length >= max) break
  }
  return out
}

export function pickPricingModel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const term = value.trim().toLowerCase()
  return PRICING_MODELS.includes(term) ? term : null
}

/** Competitor names are free text, so only the shape is constrained. */
export function cleanAlternatives(value: unknown, max = 10): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const name = entry.trim().replace(/\s+/g, ' ').slice(0, 80)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
    if (out.length >= max) break
  }
  return out
}
