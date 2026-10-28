// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { verifyAndParse } from '@profullstack/webhooks'
import { createHooks, pumpEvents, WEBHOOK_EVENT_TYPES, WEBHOOK_SOURCE, EVENTS_TABLE } from '@/lib/webhooks/hub'
import { supabaseStore } from '@/lib/webhooks/supabase-store'
import { fakeSupabase } from './fakeSupabase'

// The whole path a trigger's outbox row takes: claim, emit, drain, deliver,
// and a receiver verifying it with the secret it was shown.

function setup() {
  const sb = fakeSupabase()
  const sent: Array<{ url: string; headers: Record<string, string>; body: string }> = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), headers: init.headers as Record<string, string>, body: String(init.body) })
    return new Response('ok', { status: 200 })
  }) as unknown as typeof fetch
  const hooks = createHooks(supabaseStore(sb), {
    fetchImpl,
    guard: { allowHttp: true, allowPrivate: true },
    log: () => {},
  })
  return { sb, hooks, sent }
}

const outbox = (sb: ReturnType<typeof fakeSupabase>, row: Record<string, unknown>) => sb.rows(EVENTS_TABLE).push(row)

describe('saasrow webhooks hub', () => {
  it('emits SaaSRow events and validates endpoint patterns against them', async () => {
    const { hooks } = setup()
    expect(hooks.eventTypes).toEqual([...WEBHOOK_EVENT_TYPES])
    await expect(hooks.createEndpoint('u1', { url: 'https://hooks.example.com/x', events: ['gig.*'] })).rejects.toThrow()
    const { endpoint, secret } = await hooks.createEndpoint('u1', { url: 'https://hooks.example.com/x', events: ['product.*'] })
    expect(endpoint.events).toEqual(['product.*'])
    expect(secret).toMatch(/^whsec_/)
  })

  it('turns an outbox row into a signed CloudEvent delivery and removes the row', async () => {
    const { sb, hooks, sent } = setup()
    const { secret } = await hooks.createEndpoint('owner-1', { url: 'https://hooks.example.com/saasrow', events: ['product.upvoted'] })
    outbox(sb, {
      id: 7,
      owner: 'owner-1',
      type: 'product.upvoted',
      subject: 'product:abc',
      data: { product: { id: 'abc', title: 'Thing', upvotes: 3 }, vote: { id: 'v1', member: true } },
      claimed_until: null,
    })
    // Another owner's event and an event this endpoint did not subscribe to.
    outbox(sb, { id: 8, owner: 'owner-2', type: 'product.upvoted', subject: null, data: {}, claimed_until: null })
    outbox(sb, { id: 9, owner: 'owner-1', type: 'karma.changed', subject: null, data: { points: 1 }, claimed_until: null })

    expect(await pumpEvents(hooks, sb)).toBe(3)
    expect(sb.rows(EVENTS_TABLE)).toHaveLength(0)
    expect(sb.rows('hub_webhook_deliveries')).toHaveLength(1)

    await hooks.drain()
    expect(sent).toHaveLength(1)
    const [d] = sent
    expect(d.url).toBe('https://hooks.example.com/saasrow')

    const parsed = verifyAndParse<any>({ headers: d.headers, body: d.body, secret })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.id).toBe('evt_saasrow_7')
    expect(parsed.event).toMatchObject({
      specversion: '1.0',
      id: 'evt_saasrow_7',
      type: 'product.upvoted',
      source: WEBHOOK_SOURCE,
      subject: 'product:abc',
      data: { product: { id: 'abc', title: 'Thing', upvotes: 3 }, vote: { member: true } },
    })
    expect(typeof parsed.event.time).toBe('string')
    expect(sb.rows('hub_webhook_deliveries')[0]).toMatchObject({ status: 'delivered', attempts: 1 })
  })

  it('a wrong secret does not verify', async () => {
    const { sb, hooks, sent } = setup()
    await hooks.createEndpoint('owner-1', { url: 'https://hooks.example.com/a' })
    outbox(sb, { id: 1, owner: 'owner-1', type: 'product.approved', subject: null, data: {}, claimed_until: null })
    await pumpEvents(hooks, sb)
    await hooks.drain()
    const other = (await hooks.createEndpoint('owner-9', { url: 'https://hooks.example.com/b' })).secret
    expect(verifyAndParse({ headers: sent[0].headers, body: sent[0].body, secret: other }).ok).toBe(false)
  })

  it('leaves a row it could not emit for the next pump', async () => {
    const { sb, hooks } = setup()
    const broken = { ...hooks, emit: async () => { throw new Error('db down') } } as unknown as typeof hooks
    outbox(sb, { id: 1, owner: 'o', type: 'product.approved', subject: null, data: {}, claimed_until: null })
    expect(await pumpEvents(broken, sb)).toBe(1)
    expect(sb.rows(EVENTS_TABLE)).toHaveLength(1)
    // Claimed: the same pump does not take it again until the lease runs out.
    expect(await pumpEvents(hooks, sb)).toBe(0)
  })

  it('throws when the claim RPC fails rather than dropping events', async () => {
    const { hooks } = setup()
    const sb = { from: () => ({}), rpc: async () => ({ data: null, error: { message: 'boom' } }) }
    await expect(pumpEvents(hooks, sb as any)).rejects.toThrow(/claim: boom/)
  })
})
