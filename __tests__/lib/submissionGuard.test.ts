// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { screenSubmission } from '@/lib/submission-guard'

const post = (ip: string, d: string, path = '/api/fn/submissions') =>
  new Request(`https://saasrow.com${path}`, {
    method: 'POST',
    headers: { 'x-real-ip': ip, 'content-type': 'application/json' },
    body: JSON.stringify({ title: d, url: `https://${d}.com`, email: `hello@${d}.com`, description: 'x', category: 'Software' }),
  })

describe('screenSubmission', () => {
  it('lets a founder list their own product', async () => {
    expect(await screenSubmission(post('192.0.2.1', 'mycompany'))).toBeNull()
  })

  it('refuses one address working through a list of domains with 403', async () => {
    const run = ['abutly', 'amortlane', 'attestroom', 'attestvio', 'batesio']
    const answers = []
    for (const d of run) answers.push(await screenSubmission(post('192.0.2.66', d)))
    expect(answers.slice(0, 4)).toEqual([null, null, null, null])
    expect(answers[4]?.status).toBe(403)
    expect((await answers[4]!.json()).error).toMatch(/blocked/)
  })

  it('leaves reads and other routes alone', async () => {
    expect(await screenSubmission(new Request('https://saasrow.com/api/fn/submissions'))).toBeNull()
    expect(await screenSubmission(post('192.0.2.67', 'x', '/api/fn/vote'))).toBeNull()
  })

  it('passes a malformed body through to the edge function', async () => {
    const r = new Request('https://saasrow.com/api/fn/submissions', { method: 'POST', body: 'not json' })
    expect(await screenSubmission(r)).toBeNull()
  })
})
