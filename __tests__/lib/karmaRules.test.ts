import { describe, expect, it } from 'vitest'
import {
  KARMA_PER_CREDIT,
  badgesFor,
  dayOf,
  isReview,
  isShareNetwork,
  nextCredit,
  normalizeDisplayName,
  parsePeriod,
} from '@/lib/karmaRules'

describe('karma rules', () => {
  it('a review needs a 1-5 rating and 30+ characters', () => {
    expect(isReview('x'.repeat(30), 4)).toBe(true)
    expect(isReview('x'.repeat(29), 4)).toBe(false)
    expect(isReview('x'.repeat(40), null)).toBe(false)
    expect(isReview('x'.repeat(40), 6)).toBe(false)
    expect(isReview(`  ${'x'.repeat(29)}  `, 5)).toBe(false)
  })

  it('only the tracked networks pay', () => {
    expect(isShareNetwork('x')).toBe(true)
    expect(isShareNetwork('hn')).toBe(true)
    expect(isShareNetwork('facebook')).toBe(false)
    expect(isShareNetwork(undefined)).toBe(false)
  })

  it('unknown periods fall back to the week', () => {
    expect(parsePeriod('month')).toBe('month')
    expect(parsePeriod('all')).toBe('all')
    expect(parsePeriod('year')).toBe('week')
    expect(parsePeriod(null)).toBe('week')
  })

  it('buckets shares by UTC day', () => {
    expect(dayOf(new Date('2026-10-26T23:59:59Z'))).toBe('2026-10-26')
  })

  it('next credit counts from the highest milestone granted', () => {
    expect(nextCredit(0)).toMatchObject({ at: KARMA_PER_CREDIT, remaining: KARMA_PER_CREDIT, progress: 0 })
    expect(nextCredit(250)).toMatchObject({ at: 500, remaining: 250, progress: 0.5 })
    expect(nextCredit(500, 1)).toMatchObject({ at: 1000, remaining: 500 })
    // Karma dipped after a reversal: the granted credit is not offered again.
    expect(nextCredit(480, 1)).toMatchObject({ at: 1000, remaining: 520, progress: 0 })
  })

  it('derives badges from totals and ranks', () => {
    expect(badgesFor(5).map((b) => b.id)).toEqual([])
    expect(badgesFor(120).map((b) => b.id)).toEqual(['first-karma', 'karma-100'])
    expect(badgesFor(10, { week: 1 }).map((b) => b.id)).toEqual(['first-karma', 'top-ten-week', 'number-one'])
    expect(badgesFor(10, { week: 11, all: 1 }).map((b) => b.id)).toEqual(['first-karma', 'number-one'])
  })

  it('display names are 2-40 characters and never an email', () => {
    expect(normalizeDisplayName('  Ada   Lovelace ')).toBe('Ada Lovelace')
    expect(normalizeDisplayName('a')).toBeNull()
    expect(normalizeDisplayName('ada@example.com')).toBeNull()
    expect(normalizeDisplayName('x'.repeat(41))).toBeNull()
    expect(normalizeDisplayName(42)).toBeNull()
  })
})
