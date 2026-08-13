import { jsonResponse, corsPreflight, API_VERSION } from '@/lib/publicApi'
import { siteUrl } from '@/lib/structuredData'
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '@/lib/distribution'

export const dynamic = 'force-static'

export function OPTIONS() {
  return corsPreflight()
}

/**
 * A self-describing index so an agent that lands on /api/v1 can work out the
 * rest of the surface without documentation.
 */
export function GET() {
  const base = siteUrl()
  return jsonResponse(
    {
      name: 'SaaSRow Public API',
      version: API_VERSION,
      description:
        'Free, unauthenticated, read-only access to the SaaSRow software directory.',
      authentication: 'none',
      endpoints: {
        products: {
          url: `${base}/api/v1/products`,
          method: 'GET',
          description: 'List and filter approved products.',
          parameters: {
            q: 'Free-text match against name and description.',
            category: 'Category name (case-insensitive).',
            tag: 'Exact tag.',
            use_case: 'Controlled vocabulary; see /api/v1/vocabulary.',
            audience: 'Controlled vocabulary; see /api/v1/vocabulary.',
            platform: 'Controlled vocabulary; see /api/v1/vocabulary.',
            pricing_model: 'Controlled vocabulary; see /api/v1/vocabulary.',
            alternative_to: 'Competitor product name, case-insensitive.',
            sort: 'recent (default) | popular | views',
            limit: `1-${MAX_PAGE_SIZE}, default ${DEFAULT_PAGE_SIZE}`,
            offset: 'Zero-based pagination offset.',
          },
        },
        product: {
          url: `${base}/api/v1/products/{id}`,
          method: 'GET',
          description: 'A single product, including its schema.org JSON-LD.',
        },
        categories: { url: `${base}/api/v1/categories`, method: 'GET' },
        vocabulary: { url: `${base}/api/v1/vocabulary`, method: 'GET' },
        stats: { url: `${base}/api/v1/stats`, method: 'GET' },
      },
      mcp: {
        url: `${base}/api/mcp`,
        transport: 'streamable-http',
        description:
          'Model Context Protocol server exposing the same directory as callable tools.',
      },
      llms_txt: `${base}/llms.txt`,
      terms: `${base}/terms`,
    },
    { cacheSeconds: 86400 },
  )
}
