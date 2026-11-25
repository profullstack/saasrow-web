import { corsPreflight, errorToResponse, jsonResponse } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { getOwnedBadge } from '@/lib/badge'

// The badge for one of the caller's listings: whether it is required and
// verified, the HTML and Markdown to paste, and what to do next.
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function OPTIONS() {
  return corsPreflight()
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const { id } = await ctx.params
    return jsonResponse({ data: await getOwnedBadge(principal, id) })
  } catch (error) {
    return errorToResponse(error, 'api/v1/listings/[id]/badge')
  }
}
