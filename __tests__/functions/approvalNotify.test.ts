import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { approvalEmail, notifyListingApproved } from '../../supabase/functions/_shared/approvalNotify'
import { networkPromo } from '../../supabase/functions/_shared/networkPromo'

// The two sister directories always lead; the rest rotate per recipient.
const LINKS = ['https://built.indie.pit.world/submit?utm_source=saasrow.com', 'https://pwamart.com/console/submit?utm_source=saasrow.com']

function fakeDb(title: string, emails: string[]) {
  return {
    from(table: string) {
      const q: any = {
        select: () => q,
        eq: () => (table === 'submission_contacts' ? Promise.resolve({ data: emails.map((email) => ({ email })) }) : q),
        maybeSingle: () => Promise.resolve({ data: { title } }),
      }
      return q
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('network promo', () => {
  it('links the sister directories in both the HTML and text parts, never SaaSRow itself', async () => {
    const promo = await networkPromo('someone@example.com')
    for (const url of LINKS) {
      expect(promo.html).toContain(`href="${url}`)
      expect(promo.text).toContain(url)
    }
    expect(promo.text).not.toContain('saasrow.pwa.pit.world/submit')
    expect(promo.html).toContain('#4FFFE3')
  })
})

describe('approvalEmail', () => {
  let email: Awaited<ReturnType<typeof approvalEmail>>
  beforeAll(async () => {
    email = await approvalEmail('Acme [CRM](https://evil.test)', 'https://saasrow.pwa.pit.world/software/abc', 'https://saasrow.pwa.pit.world')
  })

  it('names the listing without letting the title become a link', () => {
    expect(email.html).not.toContain('href="https://evil.test"')
    expect(email.html).toContain('href="https://saasrow.pwa.pit.world/software/abc"')
  })

  it('carries the promo in both parts', () => {
    for (const url of LINKS) {
      expect(email.html).toContain(`href="${url}`)
      expect(email.text).toContain(url)
    }
    expect(email.text).not.toContain('](')
  })
})

describe('notifyListingApproved', () => {
  it('sends one email per contact through the Resend batch API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('Deno', { env: { get: (k: string) => ({ RESEND_API_KEY: 're_x', SITE_URL: 'https://saasrow.pwa.pit.world/' } as any)[k] } })

    await notifyListingApproved(fakeDb('Acme', ['a@acme.io', 'b@example.com', 'c@acme.io']), 'abc')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails/batch')
    const batch = JSON.parse(init.body)
    expect(batch.map((m: any) => m.to)).toEqual(['a@acme.io', 'c@acme.io'])
    expect(batch[0].subject).toBe('Acme is live on SaaSRow')
    expect(batch[0].html).toContain('href="https://saasrow.pwa.pit.world/software/abc"')
  })

  it('does nothing without a Resend key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('Deno', { env: { get: () => undefined } })
    await notifyListingApproved(fakeDb('Acme', ['a@acme.io']), 'abc')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
