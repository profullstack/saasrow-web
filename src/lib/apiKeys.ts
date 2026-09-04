// Pure helpers for API keys and CLI login codes. No database access here so
// the format rules can be unit-tested and reused by the CLI's tests.
//
// Key format: `sr_` + 40 characters from an alphabet without 0/O/1/l/I, so a
// key read aloud or retyped from a screenshot survives. Only the SHA-256 hex
// digest of the full key is stored; the first 11 characters (`sr_` + 8) are
// kept in clear as a display prefix so a user can tell keys apart.

import { createHash, randomBytes } from 'node:crypto'

export const API_KEY_PREFIX = 'sr_'
export const API_KEY_SECRET_LENGTH = 40
export const API_KEY_DISPLAY_LENGTH = API_KEY_PREFIX.length + 8
export const API_KEY_NAME_MAX = 80

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
// Login codes are typed by hand, so they are upper-case only.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const LOGIN_CODE_TTL_SECONDS = 15 * 60
export const LOGIN_CODE_MAX_ATTEMPTS = 5
export const LOGIN_CODES_PER_HOUR = 5

function randomString(alphabet: string, length: number): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export interface GeneratedApiKey {
  /** The plaintext key. Shown once, never stored. */
  raw: string
  hash: string
  prefix: string
}

export function generateApiKey(): GeneratedApiKey {
  const raw = API_KEY_PREFIX + randomString(KEY_ALPHABET, API_KEY_SECRET_LENGTH)
  return { raw, hash: sha256Hex(raw), prefix: raw.slice(0, API_KEY_DISPLAY_LENGTH) }
}

export function looksLikeApiKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9]{${API_KEY_SECRET_LENGTH}}$`).test(value)
  )
}

/** Extract the token from an `Authorization: Bearer …` header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(header)
  return match ? match[1] : null
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > 254) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null
}

export function normalizeKeyName(value: unknown, fallback = 'API key'): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  return (name || fallback).slice(0, API_KEY_NAME_MAX)
}

/** `XXXX-XXXX`, upper-case, no ambiguous glyphs. */
export function generateLoginCode(): string {
  const chars = randomString(CODE_ALPHABET, 8)
  return `${chars.slice(0, 4)}-${chars.slice(4)}`
}

/** Strip the dash and any stray whitespace so `abcd 2345` matches `ABCD-2345`. */
export function canonicalLoginCode(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * The stored digest folds the email in, so a code lifted from one inbox is
 * useless against another account. Must match the Deno copy in
 * `supabase/functions/cli-login/index.ts` byte for byte:
 * sha256("user@example.com:ABCD2345").
 */
export function hashLoginCode(email: string, code: string): string {
  return sha256Hex(`${email.trim().toLowerCase()}:${canonicalLoginCode(code)}`)
}

export interface ApiKeyRow {
  id: string
  name: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

/** The public shape of a key. Never includes the hash. */
export function serializeApiKey(row: ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.key_prefix,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    active: !row.revoked_at,
  }
}
