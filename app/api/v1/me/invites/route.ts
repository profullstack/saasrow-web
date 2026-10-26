import { corsPreflight, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { createInviteFor, inviteOverview } from '@/lib/credits'
import { siteOriginFrom } from '@/lib/inviteRules'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/** Your invites: quota, each invite's status and bonus, your affiliate link. */
export async function GET(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    return jsonResponse(await inviteOverview(principal, siteOriginFrom(req.headers)))
  } catch (error) {
    return errorToResponse(error, 'api/v1/me/invites')
  }
}

/** Create one invite: {note?}. The code and link are returned once. */
export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    const body = (await readJsonBody(req).catch(() => ({}))) as Record<string, unknown>
    return jsonResponse(await createInviteFor(principal, body.note, req, siteOriginFrom(req.headers)), { status: 201 })
  } catch (error) {
    return errorToResponse(error, 'api/v1/me/invites')
  }
}
