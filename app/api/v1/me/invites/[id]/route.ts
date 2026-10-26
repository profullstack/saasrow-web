import { ApiError, corsPreflight, errorToResponse, jsonResponse } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { revokeInviteFor } from '@/lib/credits'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function OPTIONS() {
  return corsPreflight()
}

/** Withdraw an unused invite; the slot comes back. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const { id } = await ctx.params
    if (!/^[\w-]{4,80}$/.test(id)) throw new ApiError(404, 'No such invite')
    return jsonResponse(await revokeInviteFor(principal, id))
  } catch (error) {
    return errorToResponse(error, 'api/v1/me/invites/[id]')
  }
}
