import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * GET a URL a stranger typed. Guarded the way pwamart's inspector is: http(s)
 * only, no credentials in the URL, no private, loopback or link-local address
 * on any hop, redirects followed by hand so each hop is checked, a size cap
 * and a timeout.
 */

const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 10_000
const UA = 'saasrow-badge-check/1.0 (+https://saasrow.pwa.pit.world/developers)'

export class SafeFetchError extends Error {}

export function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
    )
  }
  const v = ip.toLowerCase()
  if (v.startsWith('::ffff:')) return privateAddress(v.slice(7))
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')
}

async function assertPublic(url: string): Promise<void> {
  const u = new URL(url)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new SafeFetchError('only http and https are fetched')
  if (u.username || u.password) throw new SafeFetchError('URLs with credentials are not fetched')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new SafeFetchError(`${u.hostname} does not resolve`)
  if (addrs.some((a) => privateAddress(a.address))) throw new SafeFetchError(`${u.hostname} is not a public address`)
}

export interface SafeFetchResult {
  url: string
  status: number
  type: string
  text: string
}

export type SafeFetch = (url: string, opts?: { accept?: string }) => Promise<SafeFetchResult>

export const safeFetch: SafeFetch = async (url, { accept = '*/*' } = {}) => {
  let current = url
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(current)
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {})
      current = new URL(location, current).href
      continue
    }
    const reader = res.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > MAX_BYTES) {
          await reader.cancel().catch(() => {})
          // A page that big still has its <head> and usually its footer links
          // early enough; read what fits rather than fail the check.
          break
        }
        chunks.push(value)
      }
    }
    return {
      url: current,
      status: res.status,
      type: res.headers.get('content-type') ?? '',
      text: new TextDecoder().decode(Buffer.concat(chunks)),
    }
  }
  throw new SafeFetchError('too many redirects')
}
