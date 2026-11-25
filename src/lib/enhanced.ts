// Enhanced listings: the long-form part of a Featured or Premium listing's
// page. An overview, a named feature list, a pricing table and a "who it is
// for" paragraph, on top of what every listing has. Pure: the API, the manage
// page editor and the listing page share this one shape and its limits.

export interface EnhancedFeature {
  name: string
  text: string
}

export interface EnhancedPlan {
  plan: string
  price: string
  includes: string
}

export interface EnhancedListing {
  overview?: string
  features?: EnhancedFeature[]
  pricing?: EnhancedPlan[]
  audience?: string
}

export const ENHANCED_LIMITS = {
  overview: 3000,
  audience: 1000,
  features: 12,
  featureName: 80,
  featureText: 600,
  plans: 8,
  plan: 60,
  price: 60,
  includes: 400,
} as const

const PAID_TIERS = new Set(['featured', 'premium'])

/** Featured and Premium listings get the enhanced sections; free listings do not. */
export function hasEnhancedTier(tier: unknown): boolean {
  return PAID_TIERS.has(String(tier ?? '').toLowerCase())
}

const text = (v: unknown, max: number, keepBreaks = false): string => {
  if (typeof v !== 'string') return ''
  const s = keepBreaks ? v.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : v.replace(/\s+/g, ' ')
  return s.trim().slice(0, max)
}

/**
 * Whatever a caller sent, cut down to the shape and limits above. Plain text
 * only: nothing here is ever rendered as HTML. Returns null when nothing
 * usable is left (which is also how an owner clears the sections).
 */
export function cleanEnhanced(input: unknown): EnhancedListing | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>
  const out: EnhancedListing = {}

  const overview = text(raw.overview, ENHANCED_LIMITS.overview, true)
  if (overview) out.overview = overview

  const audience = text(raw.audience ?? raw.who_its_for, ENHANCED_LIMITS.audience, true)
  if (audience) out.audience = audience

  if (Array.isArray(raw.features)) {
    const features = raw.features
      .map((f) => {
        const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
        return { name: text(o.name, ENHANCED_LIMITS.featureName), text: text(o.text ?? o.description, ENHANCED_LIMITS.featureText) }
      })
      .filter((f) => f.name && f.text)
      .slice(0, ENHANCED_LIMITS.features)
    if (features.length) out.features = features
  }

  if (Array.isArray(raw.pricing)) {
    const pricing = raw.pricing
      .map((p) => {
        const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
        return {
          plan: text(o.plan ?? o.name, ENHANCED_LIMITS.plan),
          price: text(o.price, ENHANCED_LIMITS.price),
          includes: text(o.includes ?? o.description, ENHANCED_LIMITS.includes),
        }
      })
      .filter((p) => p.plan && p.price)
      .slice(0, ENHANCED_LIMITS.plans)
    if (pricing.length) out.pricing = pricing
  }

  return Object.keys(out).length ? out : null
}

/** The editor's two list fields are one item per line: "Name: text" and "Plan | Price | Includes". */
export function parseFeatureLines(lines: string): EnhancedFeature[] {
  return lines
    .split('\n')
    .map((line) => {
      const i = line.indexOf(':')
      return i < 0 ? { name: '', text: '' } : { name: line.slice(0, i).trim(), text: line.slice(i + 1).trim() }
    })
    .filter((f) => f.name && f.text)
}

export function parsePlanLines(lines: string): EnhancedPlan[] {
  return lines
    .split('\n')
    .map((line) => {
      const [plan = '', price = '', ...rest] = line.split('|').map((s) => s.trim())
      return { plan, price, includes: rest.join(' | ') }
    })
    .filter((p) => p.plan && p.price)
}

export const featureLines = (features: EnhancedFeature[] = []) => features.map((f) => `${f.name}: ${f.text}`).join('\n')
export const planLines = (plans: EnhancedPlan[] = []) => plans.map((p) => [p.plan, p.price, p.includes].filter(Boolean).join(' | ')).join('\n')

/** One line for the pricing page and the docs. */
export const ENHANCED_PITCH =
  'Enhanced listing: an overview, a named feature list, a pricing table and a "who it is for" section on your page'
