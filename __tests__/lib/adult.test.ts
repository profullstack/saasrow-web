import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ADULT_SIGN_IN_MESSAGE, isAdultCategory } from '@/lib/adultShared'

vi.mock('server-only', () => ({}))

const ADULT_ID = '3f2b8c1e-7a4d-4e9b-9c55-0d1e2f3a4b5c'
const PUBLIC_ID = '11111111-2222-4333-8444-555555555555'

const row = (id: string, title: string, category: string) => ({
  id,
  title,
  url: `https://${title.toLowerCase()}.test`,
  description: `${title} description`,
  category,
  tags: ['vr'],
  created_at: '2026-11-25T00:00:00Z',
})

// The table as the database holds it: an adult listing is live under status
// 'adult', never 'approved'. The fake answers by the status a query asks for,
// which is the whole mechanism: nothing that asks for 'approved' can see it.
const TABLE: Record<string, ReturnType<typeof row>[]> = {
  approved: [row(PUBLIC_ID, 'Acme', 'Software')],
  adult: [row(ADULT_ID, 'Peach', 'Adult')],
}
const asked: string[] = []

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      let status: string | null = null
      let id: string | null = null
      const rows = () => (status ? (TABLE[status] ?? []) : []).filter((r) => !id || r.id === id)
      const q: any = {
        select: () => q,
        eq: (col: string, value: string) => {
          if (col === 'status') {
            status = value
            asked.push(value)
          }
          if (col === 'id') id = value
          return q
        },
        or: () => q,
        order: () => q,
        ilike: () => q,
        contains: () => q,
        range: () => Promise.resolve({ data: rows(), count: rows().length, error: null }),
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), count: rows().length, error: null }),
      }
      return q
    },
  }),
}))

let signedIn = false
vi.mock('@/lib/apiAuth', () => ({
  authenticate: vi.fn(async () => (signedIn ? { userId: 'u1', email: 'member@site.test', keyId: null, via: 'api_key' } : null)),
}))

beforeEach(() => {
  signedIn = false
  asked.length = 0
})

const get = (path: string) => new Request(`https://saasrow.test${path}`)

describe('isAdultCategory', () => {
  it('knows the category by the names people type, and nothing else', () => {
    for (const name of ['Adult', 'adult', ' ADULT ', 'Adult (18+)', 'nsfw', 'Porn', 'XXX']) expect(isAdultCategory(name), name).toBe(true)
    for (const name of ['Software', 'Adult Education', 'adults', '', null, undefined, 18]) expect(isAdultCategory(name), String(name)).toBe(false)
  })
})

describe('GET /api/v1/adult', () => {
  it('anonymous: 401 with how to sign in, no listings, never indexed', async () => {
    const { GET } = await import('../../app/api/v1/adult/route')
    const res = await GET(get('/api/v1/adult'))
    expect(res.status).toBe(401)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    const text = await res.text()
    expect(text).toContain(ADULT_SIGN_IN_MESSAGE)
    expect(text).not.toContain('Peach')
    expect(asked).toEqual([])
  })

  it('signed in: the adult listings, private and never indexed', async () => {
    signedIn = true
    const { GET } = await import('../../app/api/v1/adult/route')
    const res = await GET(get('/api/v1/adult'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    const body = await res.json()
    expect(body.data.map((l: { name: string }) => l.name)).toEqual(['Peach'])
    expect(asked).toEqual(['adult'])
  })
})

describe('GET /api/v1/adult/{id}', () => {
  it('anonymous: 401', async () => {
    const { GET } = await import('../../app/api/v1/adult/[id]/route')
    const res = await GET(get(`/api/v1/adult/${ADULT_ID}`), { params: Promise.resolve({ id: ADULT_ID }) })
    expect(res.status).toBe(401)
    expect(await res.text()).not.toContain('Peach')
  })

  it('signed in: the listing; a public or unknown id is 404 here', async () => {
    signedIn = true
    const { GET } = await import('../../app/api/v1/adult/[id]/route')
    const ok = await GET(get(`/api/v1/adult/${ADULT_ID}`), { params: Promise.resolve({ id: ADULT_ID }) })
    expect((await ok.json()).data.name).toBe('Peach')
    const other = await GET(get(`/api/v1/adult/${PUBLIC_ID}`), { params: Promise.resolve({ id: PUBLIC_ID }) })
    expect(other.status).toBe(404)
  })
})

describe('the public product API', () => {
  it('category=adult anonymously is 401 under any spelling, and reads nothing', async () => {
    const { GET } = await import('../../app/api/v1/products/route')
    for (const category of ['adult', 'Adult', 'NSFW', 'porn']) {
      const res = await GET(get(`/api/v1/products?category=${category}`))
      expect(res.status, category).toBe(401)
      expect(await res.text()).not.toContain('Peach')
    }
    expect(asked).toEqual([])
  })

  it('category=adult signed in returns the adult listings', async () => {
    signedIn = true
    const { GET } = await import('../../app/api/v1/products/route')
    const res = await GET(get('/api/v1/products?category=adult'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect((await res.json()).data.map((l: { name: string }) => l.name)).toEqual(['Peach'])
  })

  it('a product page by id: adult is 401 anonymously, readable signed in, and an unknown id is still 404', async () => {
    const { GET } = await import('../../app/api/v1/products/[id]/route')
    const anon = await GET(get(`/api/v1/products/${ADULT_ID}`), { params: Promise.resolve({ id: ADULT_ID }) })
    expect(anon.status).toBe(401)
    expect(await anon.text()).not.toContain('Peach')

    signedIn = true
    const member = await GET(get(`/api/v1/products/${ADULT_ID}`), { params: Promise.resolve({ id: ADULT_ID }) })
    expect(member.status).toBe(200)
    expect((await member.json()).data.name).toBe('Peach')

    const missing = '99999999-2222-4333-8444-555555555555'
    const none = await GET(get(`/api/v1/products/${missing}`), { params: Promise.resolve({ id: missing }) })
    expect(none.status).toBe(404)
  })
})

describe('listAdultListings', () => {
  it('asks for status adult and nothing else', async () => {
    const { listAdultListings, isAdultListing } = await import('@/lib/adult')
    const page = await listAdultListings({ q: 'pea,ch)%', limit: 500 })
    expect(page.limit).toBe(100)
    expect(page.items[0].saasrow_url).toContain(`/software/${ADULT_ID}`)
    expect(await isAdultListing('not-a-uuid')).toBe(false)
    expect(new Set(asked)).toEqual(new Set(['adult']))
  })
})
