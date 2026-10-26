import { corsPreflight, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { memberVote, myVote } from '@/lib/karma'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function OPTIONS() {
  return corsPreflight()
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const { id } = await ctx.params
    return jsonResponse(await myVote(principal, id))
  } catch (error) {
    return errorToResponse(error, 'api/v1/products/[id]/vote')
  }
}

/** {vote_type: "upvote"|"downvote"}; the same vote again removes it. Upvotes earn karma. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const { id } = await ctx.params
    const body = (await readJsonBody(req)) as Record<string, unknown>
    return jsonResponse(await memberVote(principal, id, body.vote_type ?? 'upvote'))
  } catch (error) {
    return errorToResponse(error, 'api/v1/products/[id]/vote')
  }
}
