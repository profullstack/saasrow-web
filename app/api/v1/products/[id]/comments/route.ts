import { corsPreflight, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { memberComment } from '@/lib/karma'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function OPTIONS() {
  return corsPreflight()
}

/** {content, rating?, author_name?}: public at once; a rated 30+ character comment is a review. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const { id } = await ctx.params
    return jsonResponse(await memberComment(principal, id, await readJsonBody(req)), { status: 201 })
  } catch (error) {
    return errorToResponse(error, 'api/v1/products/[id]/comments')
  }
}
