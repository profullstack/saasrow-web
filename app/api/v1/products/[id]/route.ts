import { getProduct, serializeProduct, recordAiRead } from '@/lib/distribution'
import { jsonResponse, errorResponse, corsPreflight } from '@/lib/publicApi'
import { softwareApplicationLd } from '@/lib/structuredData'
import { ADULT_HEADERS, getAdultListing, isAdultListing } from '@/lib/adult'
import { ADULT_SIGN_IN_MESSAGE } from '@/lib/adultShared'
import { authenticate } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const product = await getProduct(id)
    if (!product) {
      // An Adult (18+) listing: members and API keys only. 401, not 404, so a
      // member following a link is told to sign in.
      if (await isAdultListing(id)) {
        if (!(await authenticate(req))) return errorResponse(ADULT_SIGN_IN_MESSAGE, 401)
        return jsonResponse({ data: await getAdultListing(id) }, { headers: ADULT_HEADERS })
      }
      return errorResponse('Product not found', 404)
    }

    void recordAiRead({
      userAgent: req.headers.get('user-agent'),
      channel: 'api',
      path: '/api/v1/products/[id]',
      submissionId: product.id,
    })

    return jsonResponse(
      {
        data: {
          ...serializeProduct(product),
          // Handing back the JSON-LD too means an agent gets schema.org-typed
          // data without having to fetch and parse the HTML page.
          schema_org: softwareApplicationLd(product),
        },
      },
      { cacheSeconds: 300 },
    )
  } catch (error) {
    console.error('[api/v1/products/[id]]', error)
    return errorResponse('Failed to load product', 500)
  }
}
