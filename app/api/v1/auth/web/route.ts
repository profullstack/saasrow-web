import { ApiError, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { canonicalLoginCode, normalizeEmail } from '@/lib/apiKeys'
import {
  authenticate,
  createApiKey,
  ensureUser,
  redeemLoginCode,
  resolveManagementToken,
  revokeApiKey,
} from '@/lib/apiAuth'
import { clearMemberCookie, setMemberCookie } from '@/lib/memberSession'

export const dynamic = 'force-dynamic'

// The website's sign-in. Same emailed codes as `saasrow login` (step one is
// POST /api/v1/auth/cli with source "web"), but the key lands in an HttpOnly
// cookie instead of the response body, so page scripts never hold it.

/** {email, code}: trade the code for a "Website" key in the member cookie. */
export async function POST(req: Request) {
  try {
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const email = normalizeEmail(body.email)
    if (!email) throw new ApiError(400, 'A valid email address is required')
    const code = canonicalLoginCode(body.code)
    if (code.length !== 8) throw new ApiError(400, 'The code looks wrong: expected 8 characters like ABCD-2345')

    await redeemLoginCode(email, code)
    const user = await ensureUser(email)
    const created = await createApiKey(user.id, 'Website')
    return jsonResponse(
      { email: user.email },
      { headers: { 'Set-Cookie': setMemberCookie({ apiKey: created.api_key }) } },
    )
  } catch (error) {
    return errorToResponse(error, 'api/v1/auth/web')
  }
}

/** {token}: a /manage link signs you in with that link's token. */
export async function PUT(req: Request) {
  try {
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const principal = token ? await resolveManagementToken(token) : null
    if (!principal) throw new ApiError(401, 'That management link is not valid')
    return jsonResponse(
      { email: principal.email },
      { headers: { 'Set-Cookie': setMemberCookie({ managementToken: token }) } },
    )
  } catch (error) {
    return errorToResponse(error, 'api/v1/auth/web')
  }
}

/** Sign out: revoke the website key (so a copied cookie dies too) and clear the cookie. */
export async function DELETE(req: Request) {
  try {
    const principal = await authenticate(req)
    if (principal?.via === 'api_key' && principal.keyId) {
      await revokeApiKey(principal.userId, principal.keyId).catch(() => undefined)
    }
    return jsonResponse({ signed_out: true }, { headers: { 'Set-Cookie': clearMemberCookie() } })
  } catch (error) {
    return errorToResponse(error, 'api/v1/auth/web')
  }
}
