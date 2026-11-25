import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  BADGE_H,
  BADGE_W,
  badgeAdvice,
  badgeSnippets,
  badgeState,
  badgeSvg,
  compact,
  linksBack,
  listBadgeSvg,
} from '@/lib/badgeShared'

vi.mock('server-only', () => ({}))

const ID = '3f2b8c1e-7a4d-4e9b-9c55-0d1e2f3a4b5c'
const SITE = 'https://saasrow.pwa.pit.world'

describe('linksBack', () => {
  it('finds the badge snippet we hand out', () => {
    const { dark, light } = badgeSnippets({ id: ID, title: 'Acme' }, SITE)
    expect(linksBack(`<footer>${dark.html}</footer>`, ID, SITE)).toBe(true)
    expect(linksBack(`<footer>${light.html}</footer>`, ID, SITE)).toBe(true)
  })

  it('accepts a plain link on any of our hosts, with or without www, query or trailing slash', () => {
    for (const href of [
      `https://saasrow.com/software/${ID}`,
      `https://www.saasrow.com/software/${ID}/`,
      `//saasrow.pwa.pit.world/software/${ID}?ref=badge`,
      `http://saasrow.com/software/${ID}#reviews`,
    ]) {
      expect(linksBack(`<a href="${href}">on SaaSRow</a>`, ID, SITE)).toBe(true)
      expect(linksBack(`<a href='${href}'>on SaaSRow</a>`, ID, SITE)).toBe(true)
    }
    expect(linksBack(`<a href=https://saasrow.com/software/${ID}>x</a>`, ID, SITE)).toBe(true)
  })

  it("refuses another listing's link, the home page, a look-alike host and bare text", () => {
    const other = '11111111-2222-4333-8444-555555555555'
    expect(linksBack(`<a href="https://saasrow.com/software/${other}">x</a>`, ID, SITE)).toBe(false)
    expect(linksBack('<a href="https://saasrow.com/">SaaSRow</a>', ID, SITE)).toBe(false)
    expect(linksBack(`<a href="https://evilsaasrow.com/software/${ID}">x</a>`, ID, SITE)).toBe(false)
    expect(linksBack(`<a href="https://saasrow.com.evil.test/software/${ID}">x</a>`, ID, SITE)).toBe(false)
    expect(linksBack(`<a href="https://saasrow.com/software/${ID}abc">x</a>`, ID, SITE)).toBe(false)
    expect(linksBack(`<p>https://saasrow.com/software/${ID}</p>`, ID, SITE)).toBe(false)
    expect(linksBack('', ID, SITE)).toBe(false)
    expect(linksBack(null, ID, SITE)).toBe(false)
  })

  it('accepts the configured site host too (a staging deploy)', () => {
    const html = `<a href="https://staging.example.dev/software/${ID}">x</a>`
    expect(linksBack(html, ID, SITE)).toBe(false)
    expect(linksBack(html, ID, 'https://staging.example.dev')).toBe(true)
  })
})

describe('badge images', () => {
  it('draws a sized, labelled SVG with the upvote count', () => {
    const svg = badgeSvg({ id: ID, title: 'Acme', upvotes: 1234 })
    expect(svg).toContain(`width="${BADGE_W}" height="${BADGE_H}"`)
    expect(svg).toContain('aria-label="Acme is listed on SaaSRow, 1234 upvotes"')
    expect(svg).toContain('▲ 1.2k')
    expect(badgeSvg({ id: ID, title: 'Acme', upvotes: 1 })).toContain('1 upvote"')
  })

  it('escapes the title, so a listing name cannot inject markup', () => {
    const svg = badgeSvg({ id: ID, title: '"><script>alert(1)</script>', upvotes: 0 })
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
  })

  it('has a light theme and an invitation for unknown listings', () => {
    expect(badgeSvg({ id: ID, title: 'Acme' }, 'light')).toContain('fill="#ffffff"')
    expect(listBadgeSvg()).toContain('LIST YOUR SOFTWARE ON')
  })

  it('compacts large numbers', () => {
    expect([0, 999, 1000, 15300, 2_500_000].map(compact)).toEqual(['0', '999', '1k', '15k', '2.5M'])
  })

  it('snippets link the listing page and escape the alt text', () => {
    const { dark, light, page } = badgeSnippets({ id: ID, title: 'A "quoted" <b>' }, `${SITE}/`)
    expect(page).toBe(`${SITE}/software/${ID}`)
    expect(dark.html).toContain(`href="${SITE}/software/${ID}"`)
    expect(dark.html).toContain(`src="${SITE}/software/${ID}/badge.svg"`)
    expect(dark.html).toContain('alt="A &quot;quoted&quot; &lt;b&gt; on SaaSRow"')
    expect(light.image).toBe(`${SITE}/software/${ID}/badge.svg?theme=light`)
    expect(dark.markdown.startsWith('[![')).toBe(true)
  })
})

describe('badgeState', () => {
  const now = new Date('2026-11-25T12:00:00Z')

  it('paid tiers and waived listings do not need the badge', () => {
    expect(badgeState({ tier: 'featured' }, now).required).toBe(false)
    expect(badgeState({ tier: 'premium' }, now).required).toBe(false)
    expect(badgeState({ tier: 'free', badge_exempt: true }, now).required).toBe(false)
    expect(badgeState({ tier: 'free' }, now).required).toBe(true)
    expect(badgeState({}, now).required).toBe(true)
  })

  it('reports a running grace period only while it is running and unverified', () => {
    const future = '2026-12-09T12:00:00Z'
    expect(badgeState({ tier: 'free', badge_grace_until: future }, now).grace_until).toBe(future)
    expect(badgeState({ tier: 'free', badge_grace_until: '2026-11-01T00:00:00Z' }, now).grace_until).toBeNull()
    expect(badgeState({ tier: 'free', badge_grace_until: future, badge_verified_at: '2026-11-20T00:00:00Z' }, now).grace_until).toBeNull()
  })

  it('knows a hidden listing from a pending one', () => {
    expect(badgeState({ status: 'badge_required' }, now).hidden).toBe(true)
    expect(badgeState({ status: 'pending' }, now).hidden).toBe(false)
  })

  it('advises each state in words that name the next step', () => {
    const url = 'https://acme.test'
    expect(badgeAdvice({ tier: 'premium', url }, SITE, now)).toMatch(/does not need/)
    expect(badgeAdvice({ tier: 'free', url, badge_verified_at: '2026-11-20T00:00:00Z' }, SITE, now)).toMatch(/verified/i)
    expect(badgeAdvice({ tier: 'free', url, status: 'badge_required' }, SITE, now)).toMatch(/hidden until the badge is on https:\/\/acme\.test/)
    expect(badgeAdvice({ tier: 'free', url, status: 'approved', badge_grace_until: '2026-12-09T12:00:00Z' }, SITE, now)).toMatch(/by 2026-12-09/)
    expect(badgeAdvice({ tier: 'free', url, status: 'pending' }, SITE, now)).toMatch(/once they are approved/)
  })
})

// ---------------------------------------------------------------------------
// The check itself: what a fetch result does to the listing row.

const updates: Array<Record<string, unknown>> = []
let saved: Record<string, unknown> = {}

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q: any = {
        update: (patch: Record<string, unknown>) => {
          updates.push(patch)
          saved = { status: 'approved', badge_verified_at: null, ...patch }
          return q
        },
        eq: () => q,
        select: () => q,
        maybeSingle: () => Promise.resolve({ data: saved, error: null }),
      }
      return q
    },
  }),
}))
vi.mock('@/lib/listings', () => ({ fetchOwned: vi.fn() }))

describe('checkBadge', () => {
  beforeEach(() => {
    updates.length = 0
    saved = {}
  })

  const page = (text: string, status = 200) => ({ url: 'x', status, type: 'text/html', text })
  const row = { id: ID, url: 'https://acme.test/app', badge_verified_at: null as string | null }

  it('looks at the listing URL and the site root', async () => {
    const { pagesToCheck } = await import('@/lib/badge')
    expect(pagesToCheck('https://acme.test/app')).toEqual(['https://acme.test/app', 'https://acme.test/'])
    expect(pagesToCheck('https://acme.test')).toEqual(['https://acme.test/'])
    expect(pagesToCheck('https://acme.test/')).toEqual(['https://acme.test/'])
  })

  it('verifies when either page links back', async () => {
    const { checkBadge } = await import('@/lib/badge')
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith('/app') ? page('<p>nothing</p>') : page(`<a href="https://saasrow.com/software/${ID}">x</a>`),
    )
    const r = await checkBadge(row, { fetchFn, site: SITE })
    expect(r.verified).toBe(true)
    expect(r.found_on).toBe('https://acme.test/')
    expect(updates[0].badge_verified_at).toEqual(expect.any(String))
  })

  it('keeps the first verification date on a re-check', async () => {
    const { checkBadge } = await import('@/lib/badge')
    const first = '2026-11-01T00:00:00.000Z'
    const fetchFn = vi.fn(async () => page(`<a href="https://saasrow.com/software/${ID}">x</a>`))
    await checkBadge({ ...row, badge_verified_at: first }, { fetchFn, site: SITE })
    expect(updates[0].badge_verified_at).toBe(first)
  })

  it('clears a verification when the page was read and the link is gone', async () => {
    const { checkBadge } = await import('@/lib/badge')
    const fetchFn = vi.fn(async () => page('<p>no badge here</p>'))
    const r = await checkBadge({ ...row, badge_verified_at: '2026-11-01T00:00:00.000Z' }, { fetchFn, site: SITE })
    expect(r.verified).toBe(false)
    expect(r.reachable).toBe(true)
    expect(updates[0].badge_verified_at).toBeNull()
  })

  it('never un-verifies a site it could not read: an outage is not a missing badge', async () => {
    const { checkBadge } = await import('@/lib/badge')
    for (const fetchFn of [
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
      vi.fn(async () => page('Bad gateway', 502)),
    ]) {
      updates.length = 0
      const r = await checkBadge({ ...row, badge_verified_at: '2026-11-01T00:00:00.000Z' }, { fetchFn, site: SITE })
      expect(r.reachable).toBe(false)
      expect(updates[0]).not.toHaveProperty('badge_verified_at')
      expect(updates[0].badge_checked_at).toEqual(expect.any(String))
    }
  })
})

describe('safeFetch address guard', () => {
  it('refuses private, loopback, link-local and CGNAT addresses', async () => {
    const { privateAddress } = await import('@/lib/safeFetch')
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.9', '169.254.169.254', '100.115.66.111', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(privateAddress(ip), ip).toBe(true)
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '100.63.0.1', '2606:4700::1111']) {
      expect(privateAddress(ip), ip).toBe(false)
    }
  })
})
