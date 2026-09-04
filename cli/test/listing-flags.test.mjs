import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listingBodyFromFlags } from '../src/listing-flags.mjs'

test('maps flags onto the API body, splitting lists', () => {
  const body = listingBodyFromFlags({
    name: 'Acme',
    website: 'https://acme.example',
    description: 'Does things',
    category: 'Analytics',
    tags: 'a, b',
    'use-cases': 'analytics,seo',
    audiences: 'developers',
    platforms: 'web',
    'pricing-model': 'free',
    alternatives: 'Google Analytics, Mixpanel',
  })
  assert.deepEqual(body, {
    name: 'Acme',
    website: 'https://acme.example',
    description: 'Does things',
    category: 'Analytics',
    tags: ['a', 'b'],
    use_cases: ['analytics', 'seo'],
    audiences: ['developers'],
    platforms: ['web'],
    pricing_model: 'free',
    alternatives: ['Google Analytics', 'Mixpanel'],
  })
})

test('accepts the storage-name aliases', () => {
  const body = listingBodyFromFlags({ title: 'T', url: 'https://t.example', 'alternative-to': 'X' })
  assert.deepEqual(body, { name: 'T', website: 'https://t.example', alternatives: ['X'] })
})

test('omits fields that were not given, so updates stay partial', () => {
  assert.deepEqual(listingBodyFromFlags({ description: 'new' }), { description: 'new' })
  assert.deepEqual(listingBodyFromFlags({}), {})
})

test('a bare flag with no value is ignored rather than sent as "true"', () => {
  assert.deepEqual(listingBodyFromFlags({ name: true }), {})
})

test('--from - seeds the body from stdin and flags override', () => {
  const body = listingBodyFromFlags(
    { from: '-', description: 'override' },
    { readStdin: () => JSON.stringify({ name: 'From file', description: 'orig', tags: ['x'] }) },
  )
  assert.deepEqual(body, { name: 'From file', description: 'override', tags: ['x'] })
})

test('--from rejects a JSON array', () => {
  assert.throws(() => listingBodyFromFlags({ from: '-' }, { readStdin: () => '[]' }), /JSON object/)
})
