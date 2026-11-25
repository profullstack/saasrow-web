import { queryProducts, serializeProduct, recordAiRead } from '@/lib/distribution'
import {
  jsonResponse,
  errorResponse,
  corsPreflight,
  intParam,
  stringParam,
  errorToResponse,
} from '@/lib/publicApi'
import { ADULT_HEADERS, listAdultListings, requireAdultAccess } from '@/lib/adult'
import { isAdultCategory } from '@/lib/adultShared'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = url.searchParams

  // The Adult (18+) category is members-only and lives apart from the public
  // directory: an explicit category=adult from a signed-in caller, nothing else.
  if (isAdultCategory(stringParam(params, 'category'))) {
    try {
      await requireAdultAccess(req)
      const page = await listAdultListings({
        q: stringParam(params, 'q'),
        sort: stringParam(params, 'sort') === 'popular' ? 'popular' : 'recent',
        limit: intParam(params, 'limit'),
        offset: intParam(params, 'offset'),
      })
      return jsonResponse(
        { data: page.items, pagination: { total: page.total, limit: page.limit, offset: page.offset, next: page.next } },
        { headers: ADULT_HEADERS },
      )
    } catch (error) {
      return errorToResponse(error, 'api/v1/products?category=adult')
    }
  }

  try {
    const page = await queryProducts({
      q: stringParam(params, 'q'),
      category: stringParam(params, 'category'),
      tag: stringParam(params, 'tag'),
      useCase: stringParam(params, 'use_case'),
      audience: stringParam(params, 'audience'),
      platform: stringParam(params, 'platform'),
      pricingModel: stringParam(params, 'pricing_model'),
      alternativeTo: stringParam(params, 'alternative_to'),
      sort: (stringParam(params, 'sort') as 'recent' | 'popular' | 'views') ?? 'recent',
      limit: intParam(params, 'limit'),
      offset: intParam(params, 'offset'),
    })

    void recordAiRead({
      userAgent: req.headers.get('user-agent'),
      channel: 'api',
      path: '/api/v1/products',
    })

    const nextOffset = page.offset + page.limit
    return jsonResponse(
      {
        data: page.items.map(serializeProduct),
        pagination: {
          total: page.total,
          limit: page.limit,
          offset: page.offset,
          next: nextOffset < page.total ? nextOffset : null,
        },
      },
      { cacheSeconds: 300 },
    )
  } catch (error) {
    console.error('[api/v1/products]', error)
    return errorResponse('Failed to query products', 500)
  }
}
