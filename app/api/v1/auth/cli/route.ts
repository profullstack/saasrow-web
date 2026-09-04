import { corsPreflight, errorResponse, errorToResponse, jsonResponse, readJsonBody, ApiError } from '@/lib/publicApi'
import { normalizeEmail, LOGIN_CODE_TTL_SECONDS } from '@/lib/apiKeys'
import { callEdgeFunction } from '@/lib/edgeProxy'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/**
 * Step one of `saasrow login`: email a one-time code. The code is generated,
 * stored and mailed by the `cli-login` edge function, since the mail
 * credentials live there; this route only validates and forwards.
 */
export async function POST(req: Request) {
  try {
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const email = normalizeEmail(body.email)
    if (!email) throw new ApiError(400, 'A valid email address is required')

    const result = await callEdgeFunction('cli-login', { email })
    if (!result.ok) {
      const message =
        (result.json as { error?: string } | null)?.error ?? 'Could not send a login code'
      // 429 (too many codes) passes through; anything else is our problem.
      return errorResponse(message, result.status === 429 ? 429 : 502)
    }

    return jsonResponse({
      ok: true,
      email,
      expires_in: LOGIN_CODE_TTL_SECONDS,
      next: 'POST /api/v1/auth/cli/verify with {"email","code","key_name"}',
    })
  } catch (error) {
    return errorToResponse(error, 'api/v1/auth/cli')
  }
}
