// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildEvent, signRequest } from '@profullstack/autoblog'
import { verifyAutoblog } from '@/lib/autoblogReceiver'

// The receiver moved from @profullstack/autoblog's verifyAndParse to
// @profullstack/webhooks. These requests are built with the autoblog SENDER's
// own code, so they prove crawlproof's existing deliveries still verify.

const post = {
  id: 'p1',
  title: 'Hello',
  slug: 'hello',
  html: '<p>hi</p>',
  status: 'published',
  published_at: '2026-10-28T00:00:00Z',
  tags: ['a'],
  categories: [],
}

function request(secret: string, opts: { bearer?: string; body?: string; ts?: number } = {}) {
  const event = buildEvent(post as any, { source: 'https://crawlproof.com', eventId: 'evt_1' })
  const body = opts.body ?? JSON.stringify(event)
  const ts = opts.ts ?? Math.floor(Date.now() / 1000)
  const headers = new Headers({
    'content-type': 'application/cloudevents+json',
    authorization: `Bearer ${opts.bearer ?? secret}`,
    ...signRequest({ id: event.id, timestamp: ts, body, secret }),
  })
  return { headers, body }
}

describe('verifyAutoblog', () => {
  // The prod secret is 64 hex characters; a whsec_ one is the trap: the
  // webhooks package would base64-decode it unless given the bytes.
  for (const secret of ['371f7a'.padEnd(64, '0'), 'whsec_dGhpcyBpcyBub3QgdGhlIGtleQ==']) {
    it(`accepts a delivery signed by @profullstack/autoblog (${secret.slice(0, 6)}…)`, () => {
      const r = verifyAutoblog({ ...request(secret), secret })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.post).toMatchObject({ id: 'p1', slug: 'hello' })
    })
  }

  it('refuses a wrong bearer, a wrong signature, a stale timestamp and a bad envelope', () => {
    const secret = 'a'.repeat(64)
    expect(verifyAutoblog({ ...request(secret, { bearer: 'b'.repeat(64) }), secret })).toMatchObject({ ok: false, status: 401 })
    const signedOther = request('c'.repeat(64))
    signedOther.headers.set('authorization', `Bearer ${secret}`)
    expect(verifyAutoblog({ ...signedOther, secret })).toMatchObject({ ok: false, status: 401 })
    expect(verifyAutoblog({ ...request(secret, { ts: Math.floor(Date.now() / 1000) - 3600 }), secret })).toMatchObject({
      ok: false,
      status: 401,
    })
    const bad = JSON.stringify({ specversion: '1.0', id: 'x', type: 't', source: 's', data: { post: { id: 1 } } })
    expect(verifyAutoblog({ ...request(secret, { body: bad }), secret })).toMatchObject({ ok: false, status: 400 })
    expect(verifyAutoblog({ ...request(secret), secret: '' })).toMatchObject({ ok: false, status: 401 })
  })
})
