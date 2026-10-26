import { corsPreflight, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { acceptInvite } from '@/lib/credits'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/** Accept an invite on a new account: {code}. Both sides get Premium days once the checks pass. */
export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const result = await acceptInvite(principal, body.code, req)
    if (!result.accepted) return jsonResponse({ error: { message: result.message } }, { status: 400 })
    return jsonResponse(result)
  } catch (error) {
    return errorToResponse(error, 'api/v1/me/invites/accept')
  }
}
