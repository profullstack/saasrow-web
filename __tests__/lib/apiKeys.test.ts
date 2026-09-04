import { describe, it, expect } from 'vitest'
import {
  generateApiKey,
  looksLikeApiKey,
  bearerToken,
  normalizeEmail,
  normalizeKeyName,
  generateLoginCode,
  canonicalLoginCode,
  hashLoginCode,
  serializeApiKey,
  sha256Hex,
  API_KEY_DISPLAY_LENGTH,
} from '@/lib/apiKeys'

describe('API key format', () => {
  it('generates sr_ keys with a stored prefix and a sha256 hash', () => {
    const key = generateApiKey()
    expect(looksLikeApiKey(key.raw)).toBe(true)
    expect(key.prefix).toBe(key.raw.slice(0, API_KEY_DISPLAY_LENGTH))
    expect(key.hash).toBe(sha256Hex(key.raw))
    expect(key.hash).toHaveLength(64)
  })

  it('never uses ambiguous glyphs', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateApiKey().raw.slice(3)).not.toMatch(/[0OIl1]/)
    }
  })

  it('generates distinct keys', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateApiKey().raw))
    expect(seen.size).toBe(100)
  })

  it('rejects anything that is not a full key', () => {
    expect(looksLikeApiKey('sr_short')).toBe(false)
    expect(looksLikeApiKey(`sk_${'a'.repeat(40)}`)).toBe(false)
    expect(looksLikeApiKey(42)).toBe(false)
  })
})

describe('bearerToken', () => {
  it('extracts the token case-insensitively and trims whitespace', () => {
    expect(bearerToken('Bearer abc')).toBe('abc')
    expect(bearerToken('  bearer   abc  ')).toBe('abc')
  })

  it('returns null for other schemes or nothing', () => {
    expect(bearerToken('Basic abc')).toBeNull()
    expect(bearerToken(null)).toBeNull()
    expect(bearerToken('')).toBeNull()
  })
})

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Me@Example.COM ')).toBe('me@example.com')
  })

  it('rejects junk', () => {
    expect(normalizeEmail('nope')).toBeNull()
    expect(normalizeEmail('a@b')).toBeNull()
    expect(normalizeEmail(123)).toBeNull()
  })
})

describe('normalizeKeyName', () => {
  it('collapses whitespace, falls back, and caps length', () => {
    expect(normalizeKeyName('  my   laptop ')).toBe('my laptop')
    expect(normalizeKeyName('')).toBe('API key')
    expect(normalizeKeyName(undefined, 'CLI')).toBe('CLI')
    expect(normalizeKeyName('x'.repeat(200))).toHaveLength(80)
  })
})

describe('login codes', () => {
  it('look like XXXX-XXXX without ambiguous glyphs', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateLoginCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
    }
  })

  it('canonicalises typed input', () => {
    expect(canonicalLoginCode('abcd-2345')).toBe('ABCD2345')
    expect(canonicalLoginCode(' abcd 2345 ')).toBe('ABCD2345')
    expect(canonicalLoginCode(null)).toBe('')
  })

  it('hashes email and code together; this vector is shared with the edge function', () => {
    // sha256("user@example.com:ABCD2345")
    expect(hashLoginCode('User@Example.com', 'abcd-2345')).toBe(
      sha256Hex('user@example.com:ABCD2345'),
    )
    expect(hashLoginCode('user@example.com', 'ABCD-2345')).not.toBe(
      hashLoginCode('other@example.com', 'ABCD-2345'),
    )
  })
})

describe('serializeApiKey', () => {
  it('exposes the prefix and status but never a hash', () => {
    const out = serializeApiKey({
      id: 'k',
      name: 'n',
      key_prefix: 'sr_abcd1234',
      created_at: '2026-09-04T00:00:00Z',
      last_used_at: null,
      revoked_at: null,
    })
    expect(out).toEqual({
      id: 'k',
      name: 'n',
      prefix: 'sr_abcd1234',
      created_at: '2026-09-04T00:00:00Z',
      last_used_at: null,
      revoked_at: null,
      active: true,
    })
    expect(JSON.stringify(out)).not.toContain('hash')
  })
})
