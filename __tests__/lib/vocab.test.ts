import { describe, it, expect } from 'vitest'
import {
  slugifyTerm,
  normalizeUseCases,
  normalizeAudiences,
  normalizePlatforms,
  normalizePricingModel,
  normalizeAlternatives,
  vocabularyManifest,
} from '@/lib/vocab'

describe('slugifyTerm', () => {
  it('lowercases and dashes whitespace', () => {
    expect(slugifyTerm('Project  Management')).toBe('project-management')
  })

  it('treats underscores as separators', () => {
    expect(slugifyTerm('project_management')).toBe('project-management')
  })

  it('strips punctuation and trims stray dashes', () => {
    expect(slugifyTerm('  --E-Commerce!!  ')).toBe('e-commerce')
  })

  it('returns an empty string for input with nothing usable', () => {
    expect(slugifyTerm('!!!')).toBe('')
  })
})

describe('normalizeUseCases', () => {
  it('keeps canonical terms', () => {
    expect(normalizeUseCases(['analytics', 'seo'])).toEqual(['analytics', 'seo'])
  })

  it('folds aliases onto the canonical term', () => {
    expect(normalizeUseCases(['devtools'])).toEqual(['developer-tools'])
  })

  it('drops terms outside the vocabulary', () => {
    expect(normalizeUseCases(['analytics', 'not-a-real-use-case'])).toEqual(['analytics'])
  })

  it('de-duplicates after normalization', () => {
    expect(normalizeUseCases(['dev-tools', 'devtools', 'Developer Tools'])).toEqual([
      'developer-tools',
    ])
  })

  it('accepts a comma-separated string', () => {
    expect(normalizeUseCases('analytics, marketing')).toEqual(['analytics', 'marketing'])
  })

  it('returns an empty array for junk input', () => {
    expect(normalizeUseCases(null)).toEqual([])
    expect(normalizeUseCases(42)).toEqual([])
    expect(normalizeUseCases([{}, 7])).toEqual([])
  })
})

describe('normalizeAudiences', () => {
  it('maps b2b onto enterprises', () => {
    expect(normalizeAudiences(['b2b'])).toEqual(['enterprises'])
  })

  it('maps several developer synonyms to one term', () => {
    expect(normalizeAudiences(['devs', 'engineers', 'programmers'])).toEqual([
      'developers',
    ])
  })
})

describe('normalizePlatforms', () => {
  it('folds macOS spellings together', () => {
    expect(normalizePlatforms(['Mac', 'OSX', 'macOS'])).toEqual(['macos'])
  })

  it('recognises mcp as a platform', () => {
    expect(normalizePlatforms(['MCP'])).toEqual(['mcp'])
  })

  it('maps saas onto web', () => {
    expect(normalizePlatforms(['SaaS'])).toEqual(['web'])
  })
})

describe('normalizePricingModel', () => {
  it('accepts a canonical value', () => {
    expect(normalizePricingModel('freemium')).toBe('freemium')
  })

  it('folds an alias', () => {
    expect(normalizePricingModel('open source')).toBe('open-source')
    expect(normalizePricingModel('pay-as-you-go')).toBe('usage-based')
  })

  it('returns null for an unknown model', () => {
    expect(normalizePricingModel('barter')).toBeNull()
    expect(normalizePricingModel(undefined)).toBeNull()
  })
})

describe('normalizeAlternatives', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalizeAlternatives(['  Google   Docs '])).toEqual(['Google Docs'])
  })

  it('preserves original casing but de-duplicates case-insensitively', () => {
    expect(normalizeAlternatives(['Notion', 'notion', 'NOTION'])).toEqual(['Notion'])
  })

  it('caps the list length', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Tool ${i}`)
    expect(normalizeAlternatives(many)).toHaveLength(10)
    expect(normalizeAlternatives(many, 3)).toHaveLength(3)
  })

  it('accepts a comma-separated string', () => {
    expect(normalizeAlternatives('Slack, Discord')).toEqual(['Slack', 'Discord'])
  })

  it('ignores empty entries', () => {
    expect(normalizeAlternatives(['', '   ', 'Linear'])).toEqual(['Linear'])
  })
})

describe('vocabularyManifest', () => {
  it('exposes all four vocabularies as non-empty arrays', () => {
    const manifest = vocabularyManifest()
    expect(manifest.use_cases.length).toBeGreaterThan(0)
    expect(manifest.audiences.length).toBeGreaterThan(0)
    expect(manifest.platforms.length).toBeGreaterThan(0)
    expect(manifest.pricing_models.length).toBeGreaterThan(0)
  })

  it('returns copies rather than the live constants', () => {
    const first = vocabularyManifest()
    first.use_cases.push('mutated')
    expect(vocabularyManifest().use_cases).not.toContain('mutated')
  })
})
