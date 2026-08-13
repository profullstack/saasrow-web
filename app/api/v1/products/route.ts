import { queryProducts, serializeProduct, recordAiRead } from '@/lib/distribution'
import {
  jsonResponse,
  errorResponse,
  corsPreflight,
  intParam,
  stringParam,
} from '@/lib/publicApi'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const params = url.searchParams

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
