// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { gateway, SUBMIT_DAILY_LIMIT, SUBMIT_PATH, submitQuotaKey } from '@/lib/crawl-gateway'

const CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

function req(method: string, ip: string, path = SUBMIT_PATH) {
  return new Request(`https://saasrow.com${path}`, {
    method,
    headers: {
      'user-agent': CHROME,
      'x-real-ip': ip,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: method === 'POST' ? '{}' : undefined,
  })
}

describe('submitQuotaKey', () => {
  it('keys a POST on the caller address', () => {
    expect(submitQuotaKey(req('POST', '203.0.113.1'))).toBe('submit:203.0.113.1')
  })

  it('does not meter reads', () => {
    expect(submitQuotaKey(req('GET', '203.0.113.1'))).toBeNull()
  })

  it('does not meter a caller with no address', () => {
    expect(submitQuotaKey(req('POST', ''))).toBeNull()
  })
})

describe('submission throttle', () => {
  it('lets the daily allowance through, then answers 402 with an offer', async () => {
    const ip = '198.51.100.7'
    for (let i = 0; i < SUBMIT_DAILY_LIMIT; i++) {
      expect(await gateway.handle(req('POST', ip))).toBeNull()
    }
    const refused = await gateway.handle(req('POST', ip))
    expect(refused?.status).toBe(402)
    const body = await refused!.json()
    expect(body.error).toMatch(/Free allowance used/)
    expect(body.quota.requests).toBe(SUBMIT_DAILY_LIMIT)
  })

  it('meters each address separately', async () => {
    for (let i = 0; i <= SUBMIT_DAILY_LIMIT; i++) await gateway.handle(req('POST', '198.51.100.8'))
    expect(await gateway.handle(req('POST', '198.51.100.9'))).toBeNull()
  })

  it('never meters reads of the listings or other routes', async () => {
    const ip = '198.51.100.10'
    for (let i = 0; i < SUBMIT_DAILY_LIMIT * 3; i++) {
      expect(await gateway.handle(req('GET', ip))).toBeNull()
      expect(await gateway.handle(req('POST', ip, '/api/fn/vote'))).toBeNull()
    }
  })
})
