import { ApiError, corsPreflight, errorToResponse, jsonResponse } from '@/lib/publicApi'
import { ADULT_HEADERS, getAdultListing, requireAdultAccess } from '@/lib/adult'

// One Adult (18+) listing, for a signed-in member or an API key.
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function OPTIONS() {
  return corsPreflight()
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    await requireAdultAccess(req)
    const { id } = await ctx.params
    const listing = await getAdultListing(id)
    if (!listing) throw new ApiError(404, 'No such listing')
    return jsonResponse({ data: listing }, { headers: ADULT_HEADERS })
  } catch (error) {
    const res = errorToResponse(error, 'api/v1/adult/[id]')
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return res
  }
}
