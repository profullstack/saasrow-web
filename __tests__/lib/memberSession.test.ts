import { describe, expect, it } from 'vitest'
import { clearMemberCookie, readMemberCookie, setMemberCookie } from '@/lib/memberSession'

const req = (cookie?: string) => new Request('https://saasrow.com/', { headers: cookie ? { cookie } : {} })
const valueOf = (setCookie: string) => setCookie.split(';')[0]

describe('member session cookie', () => {
  it('is HttpOnly, Secure and SameSite=Strict', () => {
    const c = setMemberCookie({ apiKey: 'sr_abc' })
    expect(c).toContain('HttpOnly')
    expect(c).toContain('Secure')
    expect(c).toContain('SameSite=Strict')
    expect(clearMemberCookie()).toContain('Max-Age=0')
  })

  it('round-trips an API key and a management token', () => {
    expect(readMemberCookie(req(valueOf(setMemberCookie({ apiKey: 'sr_abc' }))))).toEqual({ apiKey: 'sr_abc' })
    // User tokens are base64 and carry / + =.
    const token = 'a/b+c=='
    expect(readMemberCookie(req(`x=1; ${valueOf(setMemberCookie({ managementToken: token }))}; y=2`))).toEqual({
      managementToken: token,
    })
  })

  it('ignores missing, empty and look-alike cookies', () => {
    expect(readMemberCookie(req())).toBeNull()
    expect(readMemberCookie(req('saasrow_member='))).toBeNull()
    expect(readMemberCookie(req('saasrow_member_x=sr_abc'))).toBeNull()
    expect(readMemberCookie(req('saasrow_member=%E0%A4%A'))).toBeNull()
  })
})
