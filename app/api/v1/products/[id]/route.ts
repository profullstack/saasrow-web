import { getProduct, serializeProduct, recordAiRead } from '@/lib/distribution'
import { jsonResponse, errorResponse, corsPreflight } from '@/lib/publicApi'
import { softwareApplicationLd } from '@/lib/structuredData'

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
    if (!product) return errorResponse('Product not found', 404)

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
