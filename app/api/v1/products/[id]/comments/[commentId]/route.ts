import { corsPreflight, errorToResponse, jsonResponse } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { deleteMemberComment } from '@/lib/karma'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; commentId: string }> }

export function OPTIONS() {
  return corsPreflight()
}

/** Delete your own comment. Its karma goes back. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const { commentId } = await ctx.params
    return jsonResponse(await deleteMemberComment(principal, commentId))
  } catch (error) {
    return errorToResponse(error, 'api/v1/products/[id]/comments/[commentId]')
  }
}
