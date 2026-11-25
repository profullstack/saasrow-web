import { corsPreflight, errorToResponse, jsonResponse } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { checkOwnedBadge } from '@/lib/badge'

// Fetch the listing's site now and record whether it links back, instead of
// waiting for the background checker. A hidden listing goes live on success.
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function OPTIONS() {
  return corsPreflight()
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const { id } = await ctx.params
    return jsonResponse({ data: await checkOwnedBadge(principal, id) })
  } catch (error) {
    return errorToResponse(error, 'api/v1/listings/[id]/badge/check')
  }
}
