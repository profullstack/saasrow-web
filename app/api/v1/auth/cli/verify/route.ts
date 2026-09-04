import { corsPreflight, errorToResponse, jsonResponse, readJsonBody, ApiError } from '@/lib/publicApi'
import { canonicalLoginCode, normalizeEmail } from '@/lib/apiKeys'
import { createApiKey, ensureUser, redeemLoginCode } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/**
 * Step two of `saasrow login`: trade the emailed code for a brand-new API
 * key. Proving control of the inbox is the account — there is no password —
 * so this also creates the `users` row for a first-time email.
 */
export async function POST(req: Request) {
  try {
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const email = normalizeEmail(body.email)
    if (!email) throw new ApiError(400, 'A valid email address is required')
    const code = canonicalLoginCode(body.code)
    if (code.length !== 8) throw new ApiError(400, 'The code looks wrong: expected 8 characters like ABCD-2345')

    await redeemLoginCode(email, code)
    const user = await ensureUser(email)
    const created = await createApiKey(user.id, body.key_name ?? 'CLI')

    return jsonResponse(
      {
        api_key: created.api_key,
        key: created.key,
        user: { id: user.id, email: user.email },
      },
      { status: 201 },
    )
  } catch (error) {
    return errorToResponse(error, 'api/v1/auth/cli/verify')
  }
}
