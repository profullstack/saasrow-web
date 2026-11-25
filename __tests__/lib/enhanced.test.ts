import { describe, it, expect } from 'vitest'
import {
  ENHANCED_LIMITS,
  cleanEnhanced,
  featureLines,
  hasEnhancedTier,
  parseFeatureLines,
  parsePlanLines,
  planLines,
} from '@/lib/enhanced'
import { validateListingInput } from '@/lib/listingInput'

describe('hasEnhancedTier', () => {
  it('is Featured and Premium only', () => {
    expect(['featured', 'Premium', 'free', 'basic', null, undefined].map(hasEnhancedTier)).toEqual([true, true, false, false, false, false])
  })
})

describe('cleanEnhanced', () => {
  it('keeps the four sections, trimmed', () => {
    expect(
      cleanEnhanced({
        overview: '  A security agent.\r\n\r\n\r\n\r\nIt bans attackers.  ',
        audience: ' Linux server operators ',
        features: [{ name: ' Live detection ', text: 'Reads   logs' }, { name: '', text: 'no name' }, 'junk'],
        pricing: [{ plan: 'Free', price: '$0', includes: 'Everything' }, { plan: 'No price' }],
      }),
    ).toEqual({
      overview: 'A security agent.\n\nIt bans attackers.',
      audience: 'Linux server operators',
      features: [{ name: 'Live detection', text: 'Reads logs' }],
      pricing: [{ plan: 'Free', price: '$0', includes: 'Everything' }],
    })
  })

  it('accepts the aliases an API caller is likely to send', () => {
    expect(cleanEnhanced({ who_its_for: 'Teams', features: [{ name: 'A', description: 'B' }], pricing: [{ name: 'Pro', price: '$9' }] })).toEqual({
      audience: 'Teams',
      features: [{ name: 'A', text: 'B' }],
      pricing: [{ plan: 'Pro', price: '$9', includes: '' }],
    })
  })

  it('enforces the limits', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `F${i}`, text: 'x'.repeat(5000) }))
    const out = cleanEnhanced({ overview: 'o'.repeat(9000), features: many, pricing: many.map((f) => ({ plan: f.name, price: '$1' })) })!
    expect(out.overview).toHaveLength(ENHANCED_LIMITS.overview)
    expect(out.features).toHaveLength(ENHANCED_LIMITS.features)
    expect(out.features![0].text).toHaveLength(ENHANCED_LIMITS.featureText)
    expect(out.pricing).toHaveLength(ENHANCED_LIMITS.plans)
  })

  it('is null for nothing usable, which is how an owner clears it', () => {
    for (const v of [null, undefined, {}, [], 'text', 7, { overview: '   ' }, { features: [] }]) expect(cleanEnhanced(v)).toBeNull()
  })
})

describe('the editor line formats', () => {
  it('round-trips features and plans', () => {
    const features = [{ name: 'Live detection', text: 'Reads logs: nginx, auth' }]
    expect(parseFeatureLines(featureLines(features))).toEqual(features)
    const plans = [{ plan: 'Free', price: '$0', includes: 'Core | one site' }, { plan: 'Pro', price: '$9/mo', includes: '' }]
    expect(parsePlanLines(planLines(plans))).toEqual(plans)
  })

  it('skips lines that are not in the format', () => {
    expect(parseFeatureLines('no colon here\n: no name\nName: text')).toEqual([{ name: 'Name', text: 'text' }])
    expect(parsePlanLines('just a plan\nPlan | $1')).toEqual([{ plan: 'Plan', price: '$1', includes: '' }])
  })
})

describe('validateListingInput', () => {
  it('accepts enhanced on an update, cleaned, and lets {} clear it', () => {
    const ok = validateListingInput({ enhanced: { overview: ' Hi ', junk: 1 } }, { partial: true })
    expect(ok).toEqual({ ok: true, value: { enhanced: { overview: 'Hi' } } })
    expect(validateListingInput({ enhanced: {} }, { partial: true })).toEqual({ ok: true, value: { enhanced: null } })
  })
})
