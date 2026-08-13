import { describe, it, expect, beforeAll } from 'vitest'
import { productMarkdown, llmsTxt, llmsFullTxt } from '@/lib/markdownExport'
import type { Submission } from '@/lib/submissions'

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.saasrow.com'
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

describe('productMarkdown', () => {
  it('leads with the product name as an h1', () => {
    expect(productMarkdown(makeSubmission()).startsWith('# Test Tool')).toBe(true)
  })

  it('includes the website and the canonical listing URL', () => {
    const md = productMarkdown(makeSubmission())
    expect(md).toContain('**Website:** https://testtool.example')
    expect(md).toContain('**SaaSRow listing:** https://www.saasrow.com/software/abc-123')
  })

  it('renders vocabulary fields as comma-separated lists', () => {
    const md = productMarkdown(
      makeSubmission({ use_cases: ['analytics', 'seo'], platforms: ['web', 'cli'] }),
    )
    expect(md).toContain('**Use cases:** analytics, seo')
    expect(md).toContain('**Platforms:** web, cli')
  })

  it('omits fields that are absent rather than printing empty labels', () => {
    const md = productMarkdown(makeSubmission())
    expect(md).not.toContain('**Use cases:**')
    expect(md).not.toContain('**Pricing model:**')
    expect(md).not.toContain('**Alternative to:**')
  })

  it('omits the community line when there are no upvotes', () => {
    expect(productMarkdown(makeSubmission({ upvotes: 0 }))).not.toContain('**Community:**')
    expect(productMarkdown(makeSubmission({ upvotes: 12 }))).toContain('12 upvotes')
  })

  it('points at the structured JSON representation', () => {
    expect(productMarkdown(makeSubmission())).toContain(
      'https://www.saasrow.com/api/v1/products/abc-123',
    )
  })
})

describe('llmsTxt', () => {
  const categories = [
    { name: 'Productivity', count: 12 },
    { name: 'Developer Tools', count: 5 },
  ]

  it('opens with the h1 and a blockquote summary, per the llms.txt convention', () => {
    const lines = llmsTxt({ categories, listingCount: 17 }).split('\n')
    expect(lines[0]).toBe('# SaaSRow')
    expect(lines[2].startsWith('> ')).toBe(true)
  })

  it('states the current listing and category counts', () => {
    const txt = llmsTxt({ categories, listingCount: 17 })
    expect(txt).toContain('17 approved listings across 2 categories')
  })

  it('links every machine-readable surface', () => {
    const txt = llmsTxt({ categories, listingCount: 17 })
    for (const path of [
      '/api/v1',
      '/api/v1/products',
      '/api/v1/vocabulary',
      '/api/mcp',
      '/llms-full.txt',
    ]) {
      expect(txt).toContain(`https://www.saasrow.com${path}`)
    }
  })

  it('url-encodes category slugs', () => {
    const txt = llmsTxt({
      categories: [{ name: 'Developer Tools', count: 5 }],
      listingCount: 5,
    })
    expect(txt).toContain('/category/developer%20tools')
  })

  it('caps the category list so the index stays compact', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ name: `Cat${i}`, count: 1 }))
    const txt = llmsTxt({ categories: many, listingCount: 100 })
    expect(txt).toContain('Cat59')
    expect(txt).not.toContain('Cat60')
  })
})

describe('llmsFullTxt', () => {
  it('groups listings under category headings, alphabetically', () => {
    const txt = llmsFullTxt([
      makeSubmission({ id: '1', title: 'Zeta', category: 'Productivity' }),
      makeSubmission({ id: '2', title: 'Alpha', category: 'Analytics' }),
    ])
    expect(txt.indexOf('## Analytics')).toBeLessThan(txt.indexOf('## Productivity'))
    expect(txt).toContain('### Zeta')
    expect(txt).toContain('### Alpha')
  })

  it('reports the total product count in the summary', () => {
    expect(llmsFullTxt([makeSubmission()])).toContain('(1 products)')
  })

  it('buckets listings with no category under Uncategorized', () => {
    expect(llmsFullTxt([makeSubmission({ category: '' })])).toContain('## Uncategorized')
  })

  it('handles an empty directory without throwing', () => {
    expect(llmsFullTxt([])).toContain('# SaaSRow — full directory')
  })
})
