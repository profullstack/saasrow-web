import { corsPreflight, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { memberShare } from '@/lib/karma'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function OPTIONS() {
  return corsPreflight()
}

/** {network}: one of x, bluesky, linkedin, reddit, hn, copy. +1 per product per network a day. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const { id } = await ctx.params
    const body = (await readJsonBody(req)) as Record<string, unknown>
    return jsonResponse(await memberShare(principal, id, body.network))
  } catch (error) {
    return errorToResponse(error, 'api/v1/products/[id]/share')
  }
}
