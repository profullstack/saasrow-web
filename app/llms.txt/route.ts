import { listCategories, recordAiRead, queryProducts } from '@/lib/distribution'
import { llmsTxt } from '@/lib/markdownExport'
import { textResponse } from '@/lib/publicApi'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const [categories, page] = await Promise.all([
      listCategories(),
      // We only need the count, so ask for a single row.
      queryProducts({ limit: 1 }),
    ])

    void recordAiRead({
      userAgent: req.headers.get('user-agent'),
      channel: 'llms_txt',
      path: '/llms.txt',
    })

    return textResponse(llmsTxt({ categories, listingCount: page.total }), {
      cacheSeconds: 3600,
      contentType: 'text/plain; charset=utf-8',
    })
  } catch (error) {
    console.error('[llms.txt]', error)
    return textResponse('# SaaSRow\n\n> Directory temporarily unavailable.\n', {
      status: 503,
    })
  }
}
