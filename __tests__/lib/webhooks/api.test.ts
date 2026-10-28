// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { memoryStore } from '@profullstack/webhooks'
import { createHooks } from '@/lib/webhooks/hub'

const auth = vi.hoisted(() => ({ principal: null as null | { userId: string } }))
const hooks = vi.hoisted(() => ({ current: null as any }))

vi.mock('@/lib/apiAuth', async () => {
  const { ApiError } = await import('@/lib/publicApi')
  return {
    requirePrincipal: async () => {
      if (!auth.principal) throw new ApiError(401, 'Authentication required.')
      return auth.principal
    },
  }
})
vi.mock('@/lib/webhooks/hub', async (orig) => ({ ...(await orig<object>()), getHooks: () => hooks.current }))

const { GET, POST, DELETE } = await import('../../../app/api/v1/webhooks/[[...path]]/route')

const req = (path: string, init: RequestInit = {}) => new Request(`https://saasrow.com/api/v1/webhooks${path}`, init)

describe('/api/v1/webhooks', () => {
  beforeEach(() => {
    auth.principal = null
    hooks.current = createHooks(memoryStore(), { log: () => {}, guard: { lookup: async () => ['93.184.216.34'] } })
  })

  it('answers 401 without a credential', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(401)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it("scopes every call to the caller's account", async () => {
    auth.principal = { userId: 'u1' }
    const created = await POST(
      req('', { method: 'POST', body: JSON.stringify({ url: 'https://hooks.example.com/x', events: ['product.*'] }) }),
    )
    expect(created.status).toBe(201)
    const { endpoint, secret } = await created.json()
    expect(secret).toMatch(/^whsec_/)

    const list = await (await GET(req(''))).json()
    expect(list.endpoints.map((e: { id: string }) => e.id)).toEqual([endpoint.id])
    expect(list.event_types).toContain('product.upvoted')

    auth.principal = { userId: 'u2' }
    expect((await (await GET(req(''))).json()).endpoints).toEqual([])
    expect((await GET(req(`/${endpoint.id}`))).status).toBe(404)
    expect((await DELETE(req(`/${endpoint.id}`, { method: 'DELETE' }))).status).toBe(404)

    auth.principal = { userId: 'u1' }
    expect((await DELETE(req(`/${endpoint.id}`, { method: 'DELETE' }))).status).toBe(200)
  })
})
