import { describe, it, expect, beforeAll } from 'vitest'
import {
  softwareApplicationLd,
  breadcrumbLd,
  itemListLd,
  websiteLd,
  organizationLd,
} from '@/lib/structuredData'
import type { Submission } from '@/lib/submissions'

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.saasrow.com'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
})

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'abc-123',
    title: 'Test Tool',
    url: 'https://testtool.example',
    description: 'A tool for testing.',
    category: 'Productivity',
    status: 'approved',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('softwareApplicationLd', () => {
  it('emits a SoftwareApplication with the canonical listing URL', () => {
    const ld = softwareApplicationLd(makeSubmission())
    expect(ld['@type']).toBe('SoftwareApplication')
    expect(ld.url).toBe('https://www.saasrow.com/software/abc-123')
    expect(ld.name).toBe('Test Tool')
  })

  it('links back to the maker site via sameAs', () => {
    const ld = softwareApplicationLd(makeSubmission())
    expect(ld.sameAs).toEqual(['https://testtool.example'])
  })

  it('omits aggregateRating entirely when nobody has voted', () => {
    const ld = softwareApplicationLd(makeSubmission())
    expect(ld).not.toHaveProperty('aggregateRating')
  })

  it('emits a rating once there is at least one vote', () => {
    const ld = softwareApplicationLd(makeSubmission({ upvotes: 9, downvotes: 1 }))
    expect(ld.aggregateRating).toMatchObject({
      '@type': 'AggregateRating',
      ratingCount: 10,
      bestRating: 5,
    })
    // 9/10 upvotes maps to 1 + 0.9*4 = 4.6 on the 1-5 scale.
    expect(ld.aggregateRating.ratingValue).toBeCloseTo(4.6, 5)
  })

  it('marks free products with a zero-price offer', () => {
    const ld = softwareApplicationLd(makeSubmission({ pricing_model: 'free' }))
    expect(ld.offers).toMatchObject({ price: '0', priceCurrency: 'USD' })
  })

  it('omits the offer when no pricing model is recorded', () => {
    expect(softwareApplicationLd(makeSubmission())).not.toHaveProperty('offers')
  })

  it('maps alternatives onto isSimilarTo', () => {
    const ld = softwareApplicationLd(makeSubmission({ alternatives: ['Notion'] }))
    expect(ld.isSimilarTo).toEqual([{ '@type': 'SoftwareApplication', name: 'Notion' }])
  })

  it('maps audiences onto schema.org Audience nodes', () => {
    const ld = softwareApplicationLd(makeSubmission({ audiences: ['developers'] }))
    expect(ld.audience).toEqual([{ '@type': 'Audience', audienceType: 'developers' }])
  })

  it('drops empty arrays rather than emitting them', () => {
    const ld = softwareApplicationLd(makeSubmission({ tags: [], platforms: [] }))
    expect(ld).not.toHaveProperty('keywords')
    expect(ld).not.toHaveProperty('operatingSystem')
  })

  it('builds an absolute storage URL for the listing image', () => {
    const ld = softwareApplicationLd(makeSubmission({ image: 'shot.png' }))
    expect(ld.image).toBe(
      'https://example.supabase.co/storage/v1/object/public/software-images/shot.png',
    )
  })

  it('falls back to the logo when there is no screenshot', () => {
    const ld = softwareApplicationLd(makeSubmission({ logo: 'logo.png' }))
    expect(ld.image).toBe(
      'https://example.supabase.co/storage/v1/object/public/software-logos/logo.png',
    )
  })
})

describe('breadcrumbLd', () => {
  it('walks home -> categories -> category -> product', () => {
    const ld = breadcrumbLd(makeSubmission())
    expect(ld.itemListElement.map((i) => i.name)).toEqual([
      'Home',
      'Categories',
      'Productivity',
      'Test Tool',
    ])
    expect(ld.itemListElement[0].position).toBe(1)
    expect(ld.itemListElement[3].position).toBe(4)
  })

  it('skips the category step when the listing has none', () => {
    const ld = breadcrumbLd(makeSubmission({ category: '' }))
    expect(ld.itemListElement).toHaveLength(3)
  })
})

describe('itemListLd', () => {
  it('numbers entries from one and reports the count', () => {
    const ld = itemListLd([makeSubmission(), makeSubmission({ id: 'def-456' })], {
      name: 'Productivity software',
      url: 'https://www.saasrow.com/category/productivity',
    })
    expect(ld.numberOfItems).toBe(2)
    expect(ld.itemListElement[0].position).toBe(1)
    expect(ld.itemListElement[1].url).toBe('https://www.saasrow.com/software/def-456')
  })

  it('handles an empty list', () => {
    const ld = itemListLd([], { name: 'Empty', url: 'https://www.saasrow.com/x' })
    expect(ld.numberOfItems).toBe(0)
    expect(ld.itemListElement).toEqual([])
  })
})

describe('site-level nodes', () => {
  it('exposes a SearchAction pointing at the explore page', () => {
    const ld = websiteLd()
    expect(ld.potentialAction.target.urlTemplate).toContain('/explore?q=')
    expect(ld['query-input' as keyof typeof ld]).toBeUndefined()
    expect(ld.potentialAction['query-input']).toBe('required name=search_term_string')
  })

  it('identifies the organization with a stable @id', () => {
    expect(organizationLd()['@id']).toBe('https://www.saasrow.com#organization')
  })
})
