import { describe, it, expect, vi, afterEach } from 'vitest'
import { approvalEmail, notifyListingApproved } from '../../supabase/functions/_shared/approvalNotify'
import { promoHtml, promoText } from '../../supabase/functions/_shared/networkPromo'

const LINKS = [
  'https://built.indie.pit.world/submit',
  'https://pwamart.com/console/submit',
  'https://demo.movie',
  'https://mynaposter.com',
]

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
  it('links every promoted site in both the HTML and text parts', () => {
    for (const url of LINKS) {
      expect(promoHtml()).toContain(`href="${url}"`)
      expect(promoText()).toContain(url)
    }
  })
})

describe('approvalEmail', () => {
  const email = approvalEmail('Acme [CRM](https://evil.test)', 'https://saasrow.com/software/abc', 'https://saasrow.com')

  it('names the listing without letting the title become a link', () => {
    expect(email.html).not.toContain('href="https://evil.test"')
    expect(email.html).toContain('href="https://saasrow.com/software/abc"')
  })

  it('carries the promo in both parts', () => {
    for (const url of LINKS) {
      expect(email.html).toContain(`href="${url}"`)
      expect(email.text).toContain(url)
    }
    expect(email.text).not.toContain('](')
  })
})

describe('notifyListingApproved', () => {
  it('sends one email per contact through the Resend batch API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('Deno', { env: { get: (k: string) => ({ RESEND_API_KEY: 're_x', SITE_URL: 'https://saasrow.com/' } as any)[k] } })

    await notifyListingApproved(fakeDb('Acme', ['a@acme.io', 'b@example.com', 'c@acme.io']), 'abc')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails/batch')
    const batch = JSON.parse(init.body)
    expect(batch.map((m: any) => m.to)).toEqual(['a@acme.io', 'c@acme.io'])
    expect(batch[0].subject).toBe('Acme is live on SaaSRow')
    expect(batch[0].html).toContain('href="https://saasrow.com/software/abc"')
  })

  it('does nothing without a Resend key', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('Deno', { env: { get: () => undefined } })
    await notifyListingApproved(fakeDb('Acme', ['a@acme.io']), 'abc')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
