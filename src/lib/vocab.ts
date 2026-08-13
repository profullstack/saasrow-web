// Controlled vocabularies for machine-readable product data.
//
// Free-text tags are great for humans and terrible for agents: "b2b", "B2B",
// and "business-to-business" are three different strings for one idea. These
// closed lists are what the public API, the MCP server and the JSON-LD all
// filter on, so a query for `audience=developers` returns the same set every
// time regardless of how the maker typed it in.

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
] as const

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
] as const

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
] as const

export const PRICING_MODELS = [
  'free',
  'freemium',
  'one-time',
  'open-source',
  'paid',
  'subscription',
  'usage-based',
] as const

export type UseCase = (typeof USE_CASES)[number]
export type Audience = (typeof AUDIENCES)[number]
export type Platform = (typeof PLATFORMS)[number]
export type PricingModel = (typeof PRICING_MODELS)[number]

/** Aliases we accept on input and fold into the canonical term. */
const ALIASES: Record<string, string> = {
  'b2b': 'enterprises',
  'business': 'small-business',
  'smb': 'small-business',
  'devs': 'developers',
  'engineering': 'developers',
  'engineers': 'developers',
  'programmers': 'developers',
  'dev-tools': 'developer-tools',
  'devtools': 'developer-tools',
  'chrome-extension': 'browser-extension',
  'firefox-extension': 'browser-extension',
  'command-line': 'cli',
  'terminal': 'cli',
  'mac': 'macos',
  'osx': 'macos',
  'os-x': 'macos',
  'iphone': 'ios',
  'ipad': 'ios',
  'saas': 'web',
  'webapp': 'web',
  'web-app': 'web',
  'website': 'web',
  'selfhosted': 'self-hosted',
  'on-premise': 'self-hosted',
  'oss': 'open-source',
  'opensource': 'open-source',
  'subscription-based': 'subscription',
  'recurring': 'subscription',
  'lifetime': 'one-time',
  'pay-once': 'one-time',
  'pay-as-you-go': 'usage-based',
  'metered': 'usage-based',
  'project-mgmt': 'project-management',
  'pm': 'project-management',
  'support': 'customer-support',
  'helpdesk': 'customer-support',
  'ai-writing': 'writing',
  'copywriting': 'writing',
  'ecommerce': 'e-commerce',
  'human-resources': 'hr',
  'search-engine-optimization': 'seo',
}

/**
 * Lowercase, trim, collapse whitespace/underscores to single dashes and strip
 * anything that isn't a letter, digit or dash. `"Project  Management"` and
 * `"project_management"` both become `"project-management"`.
 */
export function slugifyTerm(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeAgainst<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  if (typeof value !== 'string') return null
  const slug = slugifyTerm(value)
  if (!slug) return null
  const canonical = ALIASES[slug] ?? slug
  return (allowed as readonly string[]).includes(canonical) ? (canonical as T) : null
}

function normalizeList<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const out: T[] = []
  for (const entry of raw) {
    const term = normalizeAgainst(entry, allowed)
    if (term && !out.includes(term)) out.push(term)
  }
  return out
}

export const normalizeUseCases = (v: unknown): UseCase[] => normalizeList(v, USE_CASES)
export const normalizeAudiences = (v: unknown): Audience[] => normalizeList(v, AUDIENCES)
export const normalizePlatforms = (v: unknown): Platform[] => normalizeList(v, PLATFORMS)
export const normalizePricingModel = (v: unknown): PricingModel | null =>
  normalizeAgainst(v, PRICING_MODELS)

/**
 * Alternatives are competitor product names, not a closed list — we only
 * normalize shape (trimmed, de-duped, capped) so `alternative_to` lookups are
 * stable. Comparison is case-insensitive; the original casing is preserved for
 * display.
 */
export function normalizeAlternatives(value: unknown, limit = 10): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const name = entry.trim().replace(/\s+/g, ' ')
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
    if (out.length >= limit) break
  }
  return out
}

/** The full vocabulary, shaped for the `/api/v1/vocabulary` discovery endpoint. */
export function vocabularyManifest() {
  return {
    use_cases: [...USE_CASES],
    audiences: [...AUDIENCES],
    platforms: [...PLATFORMS],
    pricing_models: [...PRICING_MODELS],
  }
}
