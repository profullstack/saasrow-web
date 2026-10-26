import { corsPreflight, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { setDisplayName } from '@/lib/karma'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/** Who am I? The CLI's `whoami`, and the cheapest way to check a key works. */
export async function GET(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    return jsonResponse({
      user: { id: principal.userId, email: principal.email },
      authenticated_via: principal.via,
      key_id: principal.keyId,
    })
  } catch (error) {
    return errorToResponse(error, 'api/v1/me')
  }
}

/** {display_name}: the name the leaderboard and your comments show. Never your email. */
export async function PATCH(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    const body = (await readJsonBody(req)) as Record<string, unknown>
    return jsonResponse(await setDisplayName(principal, body.display_name))
  } catch (error) {
    return errorToResponse(error, 'api/v1/me')
  }
}
