import { describe, it, expect } from 'vitest'
import { validateListingInput, normalizeListingUrl, LISTING_LIMITS } from '@/lib/listingInput'

const good = {
  name: 'Acme Analytics',
  website: 'https://acme.example/',
  description: 'Privacy-first analytics.',
}

function ok(input: unknown, opts?: { partial?: boolean }) {
  const result = validateListingInput(input, opts)
  if (!result.ok) throw new Error(`expected ok, got: ${result.errors.join('; ')}`)
  return result.value
}

function errorsOf(input: unknown, opts?: { partial?: boolean }) {
  const result = validateListingInput(input, opts)
  if (result.ok) throw new Error('expected errors')
  return result.errors
}

describe('create', () => {
  it('maps the public field names onto storage columns with defaults', () => {
    expect(ok(good)).toEqual({
      title: 'Acme Analytics',
      url: 'https://acme.example',
      description: 'Privacy-first analytics.',
      category: 'Software',
      tags: [],
      use_cases: [],
      audiences: [],
      platforms: [],
      pricing_model: null,
      alternatives: [],
    })
  })

  it('accepts the storage names as aliases', () => {
    const value = ok({ title: 'T', url: 'https://t.example', description: 'd' })
    expect(value.title).toBe('T')
    expect(value.url).toBe('https://t.example')
  })

  it('reports every missing field at once', () => {
    expect(errorsOf({})).toEqual(['name is required', 'website is required', 'description is required'])
  })

  it('rejects a non-object body', () => {
    expect(errorsOf(null)).toEqual(['body must be a JSON object'])
    expect(errorsOf([])).toEqual(['body must be a JSON object'])
  })

  it('enforces length limits', () => {
    expect(errorsOf({ ...good, name: 'x'.repeat(LISTING_LIMITS.title + 1) })[0]).toMatch(/name must be at most/)
    expect(errorsOf({ ...good, description: 'x'.repeat(LISTING_LIMITS.description + 1) })[0]).toMatch(
      /description must be at most/,
    )
  })

  it('normalises tags: lowercased, dashed, de-duplicated, capped', () => {
    expect(ok({ ...good, tags: ['Self Hosted', 'self-hosted', ' Privacy '] }).tags).toEqual([
      'self-hosted',
      'privacy',
    ])
    expect(ok({ ...good, tags: 'a, b' }).tags).toEqual(['a', 'b'])
    expect(errorsOf({ ...good, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).toEqual([
      `at most ${LISTING_LIMITS.tags} tags`,
    ])
    expect(errorsOf({ ...good, tags: [1] })).toEqual(['tags must be a list of strings'])
  })

  it('drops unknown vocabulary terms instead of rejecting', () => {
    const value = ok({
      ...good,
      use_cases: ['analytics', 'made-up'],
      pricing_model: 'Free',
      platforms: 'web,ios',
      alternatives: ['Mixpanel', 'mixpanel', ''],
    })
    expect(value.use_cases).toEqual(['analytics'])
    expect(value.pricing_model).toBe('free')
    expect(value.platforms).toEqual(['web', 'ios'])
    expect(value.alternatives).toEqual(['Mixpanel'])
  })
})

describe('update (partial)', () => {
  it('only returns the fields supplied', () => {
    expect(ok({ description: 'new' }, { partial: true })).toEqual({ description: 'new' })
  })

  it('refuses an empty patch', () => {
    expect(errorsOf({}, { partial: true })).toEqual(['nothing to update'])
  })

  it('still validates what is supplied', () => {
    expect(errorsOf({ website: 'not a url' }, { partial: true })).toEqual(['website must be a valid URL'])
  })
})

describe('normalizeListingUrl', () => {
  it('adds https and strips trailing slashes', () => {
    expect(normalizeListingUrl('acme.example/').url).toBe('https://acme.example')
    expect(normalizeListingUrl('https://acme.example/app///').url).toBe('https://acme.example/app')
  })

  it('rejects non-http schemes, credentials and bare hosts', () => {
    expect(normalizeListingUrl('ftp://acme.example').error).toMatch(/http or https/)
    expect(normalizeListingUrl('https://user:pw@acme.example').error).toMatch(/public URL/)
    expect(normalizeListingUrl('https://localhost').error).toMatch(/public URL/)
    expect(normalizeListingUrl('').error).toMatch(/required/)
  })
})
