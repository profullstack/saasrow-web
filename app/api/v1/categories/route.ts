import { listCategories, recordAiRead } from '@/lib/distribution'
import { jsonResponse, errorResponse, corsPreflight } from '@/lib/publicApi'
import { siteUrl } from '@/lib/structuredData'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

export async function GET(req: Request) {
  try {
    const categories = await listCategories()

    void recordAiRead({
      userAgent: req.headers.get('user-agent'),
      channel: 'api',
      path: '/api/v1/categories',
    })

    const base = siteUrl()
    return jsonResponse(
      {
        data: categories.map((c) => ({
          name: c.name,
          slug: c.name.toLowerCase(),
          count: c.count,
          url: `${base}/category/${encodeURIComponent(c.name.toLowerCase())}`,
        })),
      },
      { cacheSeconds: 900 },
    )
  } catch (error) {
    console.error('[api/v1/categories]', error)
    return errorResponse('Failed to list categories', 500)
  }
}
