// The website's member session cookie. It holds the credential the browser
// signed in with (a "Website" API key, or "mt:<token>" from a /manage link) so
// page scripts never see it: HttpOnly, Secure, SameSite=Strict.
//
// apiAuth reads it only when the request also carries X-Saasrow-Member, a
// header no cross-site form can set, so the cookie alone authorizes nothing.

export const MEMBER_COOKIE = 'saasrow_member'
export const MEMBER_HEADER = 'x-saasrow-member'
const MANAGEMENT_PREFIX = 'mt:'
const ONE_YEAR = 365 * 24 * 60 * 60

export type MemberCookie = { apiKey: string } | { managementToken: string }

export function memberCookieValue(c: MemberCookie): string {
  return 'apiKey' in c ? c.apiKey : MANAGEMENT_PREFIX + c.managementToken
}

export function setMemberCookie(c: MemberCookie): string {
  return `${MEMBER_COOKIE}=${encodeURIComponent(memberCookieValue(c))}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Strict`
}

export function clearMemberCookie(): string {
  return `${MEMBER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
}

/** The credential in the request's member cookie, if any. */
export function readMemberCookie(req: Request): MemberCookie | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0 || part.slice(0, eq).trim() !== MEMBER_COOKIE) continue
    let value: string
    try {
      value = decodeURIComponent(part.slice(eq + 1).trim())
    } catch {
      return null
    }
    if (!value) return null
    return value.startsWith(MANAGEMENT_PREFIX)
      ? { managementToken: value.slice(MANAGEMENT_PREFIX.length) }
      : { apiKey: value }
  }
  return null
}
