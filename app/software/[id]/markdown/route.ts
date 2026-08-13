import { getProduct, recordAiRead } from '@/lib/distribution'
import { productMarkdown } from '@/lib/markdownExport'
import { textResponse } from '@/lib/publicApi'

// A plain-markdown rendering of a single listing, for agents that would rather
// read prose than parse JSON. Linked from the HTML page via <link rel="alternate">.
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const product = await getProduct(id)
    if (!product) {
      return textResponse('Not found\n', { status: 404 })
    }

    void recordAiRead({
      userAgent: req.headers.get('user-agent'),
      channel: 'crawler',
      path: '/software/[id]/markdown',
      submissionId: product.id,
    })

    return textResponse(productMarkdown(product), {
      cacheSeconds: 300,
      contentType: 'text/markdown; charset=utf-8',
    })
  } catch (error) {
    console.error('[software/[id]/markdown]', error)
    return textResponse('Temporarily unavailable\n', { status: 503 })
  }
}
