import { corsPreflight, errorToResponse, intParam, jsonResponse, stringParam } from '@/lib/publicApi'
import { ADULT_HEADERS, listAdultListings, requireAdultAccess } from '@/lib/adult'
import { ADULT_LABEL, ADULT_NOTICE } from '@/lib/adultShared'

// The Adult (18+) category. Signed-in members and API keys only: these
// listings appear nowhere else (no public list, search, feed or sitemap).
export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

export async function GET(req: Request) {
  try {
    await requireAdultAccess(req)
    const params = new URL(req.url).searchParams
    const page = await listAdultListings({
      q: stringParam(params, 'q'),
      sort: stringParam(params, 'sort') === 'popular' ? 'popular' : 'recent',
      limit: intParam(params, 'limit'),
      offset: intParam(params, 'offset'),
    })
    return jsonResponse(
      {
        category: ADULT_LABEL,
        notice: ADULT_NOTICE,
        data: page.items,
        pagination: { total: page.total, limit: page.limit, offset: page.offset, next: page.next },
      },
      { headers: ADULT_HEADERS },
    )
  } catch (error) {
    const res = errorToResponse(error, 'api/v1/adult')
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return res
  }
}
