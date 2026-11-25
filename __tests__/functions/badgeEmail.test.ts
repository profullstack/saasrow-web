import { describe, it, expect } from 'vitest'
import { badgeEmail, badgeHtml } from '../../supabase/functions/_shared/badgeEmail'
import { badgeSnippets, linksBack } from '../../src/lib/badgeShared'

const SITE = 'https://saasrow.pwa.pit.world'
const listing = {
  id: '3f2b8c1e-7a4d-4e9b-9c55-0d1e2f3a4b5c',
  title: 'Acme [CRM](https://evil.test)',
  url: 'https://acme.test',
  management_token: 'ab+c/d=',
  badge_grace_until: '2026-12-09T12:00:00Z',
}

describe('badgeHtml', () => {
  it('is the same snippet the manage page hands out, and the checker accepts it', () => {
    const plain = { id: listing.id, title: 'Acme' }
    expect(badgeHtml(plain, SITE)).toBe(badgeSnippets(plain, SITE).dark.html)
    expect(linksBack(badgeHtml(listing, `${SITE}/`), listing.id, SITE)).toBe(true)
  })
})

describe('badgeEmail', () => {
  it('first notice: names the deadline, carries the snippet, the manage link and the paid way out', async () => {
    const email = await badgeEmail('notice', listing, SITE, { seed: 'a@acme.test' })
    expect(email.subject).toBe('Add the SaaSRow badge to keep Acme CRMhttps://evil.test listed')
    expect(email.html).toContain('December 9, 2026')
    expect(email.html).toContain(`${SITE}/software/${listing.id}/badge.svg`)
    expect(email.html).toContain(`${SITE}/manage/ab%2Bc%2Fd%3D`)
    expect(email.html).toContain(`${SITE}/featured`)
    expect(email.text).toContain(`<a href="${SITE}/software/${listing.id}">`)
    expect(email.from).toBe('SaaSRow <noreply@saasrow.com>')
    expect(email.reply_to).toBe('support@saasrow.com')
  })

  it('never turns a listing title into a link', async () => {
    const email = await badgeEmail('notice', listing, SITE)
    expect(email.html).not.toContain('href="https://evil.test')
  })

  it('a badge that went missing gets its own words', async () => {
    const email = await badgeEmail('notice', { ...listing, badge_lost_at: '2026-11-25T00:00:00Z' }, SITE)
    expect(email.subject).toMatch(/^The SaaSRow badge is missing from /)
    expect(email.text).toContain('could no longer find')
  })

  it('required: a new approval and a lapsed listing read differently', async () => {
    const fresh = await badgeEmail('required', listing, SITE)
    expect(fresh.subject).toMatch(/is approved: add the badge to go live$/)
    const lapsed = await badgeEmail('required', listing, SITE, { wasLive: true })
    expect(lapsed.subject).toMatch(/is hidden on SaaSRow until the badge is on your site$/)
    expect(lapsed.text).toContain('Nothing is lost')
    for (const email of [fresh, lapsed]) expect(email.text).toContain('badge.svg')
  })

  it('live: links the listing, and says to keep the badge when one was found', async () => {
    const email = await badgeEmail('live', { ...listing, badge_verified_at: '2026-11-25T00:00:00Z' }, SITE)
    expect(email.subject).toMatch(/is live on SaaSRow$/)
    expect(email.html).toContain(`${SITE}/software/${listing.id}`)
    expect(email.text).toContain('Keep it there')
    expect((await badgeEmail('live', listing, SITE)).text).not.toContain('Keep it there')
  })

  it('carries the network promo, like every transactional email', async () => {
    const email = await badgeEmail('live', listing, SITE, { seed: 'a@acme.test' })
    expect(email.html).toContain('utm_source=saasrow.com')
  })
})
