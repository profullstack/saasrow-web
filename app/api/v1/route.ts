import { jsonResponse, corsPreflight, API_VERSION } from '@/lib/publicApi'
import { siteUrl } from '@/lib/structuredData'
import { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '@/lib/distribution'
import { LISTING_LIMITS } from '@/lib/listingInput'

export const dynamic = 'force-static'

export function OPTIONS() {
  return corsPreflight()
}

const AUTH_DESCRIPTION =
  'Send an API key as `Authorization: Bearer sr_…`. Keys belong to an account identified by email; create the first one with `npx @profullstack/saasrow login`, or from the API keys panel on your listing management page.'

/**
 * A self-describing index so an agent that lands on /api/v1 can work out the
 * rest of the surface without documentation.
 */
export function GET() {
  const base = siteUrl()
  const listingFields = {
    name: `Product name, required on create (max ${LISTING_LIMITS.title} chars).`,
    website: 'Product URL, required on create. Must not already be listed.',
    description: `Required on create (max ${LISTING_LIMITS.description} chars).`,
    category: 'Category name; defaults to "Software".',
    tags: `Array of strings (max ${LISTING_LIMITS.tags}).`,
    use_cases: 'Array of controlled-vocabulary terms; unknown terms are dropped.',
    audiences: 'Array of controlled-vocabulary terms; unknown terms are dropped.',
    platforms: 'Array of controlled-vocabulary terms; unknown terms are dropped.',
    pricing_model: 'One controlled-vocabulary term.',
    alternatives: 'Array of product names this one is an alternative to (max 10).',
  }

  return jsonResponse(
    {
      name: 'SaaSRow Public API',
      version: API_VERSION,
      description:
        'Read the SaaSRow software directory for free with no key. Create and manage your own free listings, and your API keys, with an account.',
      authentication: {
        read: 'none',
        write: AUTH_DESCRIPTION,
      },
      docs: `${base}/developers`,
      cli: {
        package: '@profullstack/saasrow',
        install: 'npm install -g @profullstack/saasrow',
        login: 'saasrow login',
      },
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

        me: {
          url: `${base}/api/v1/me`,
          method: 'GET',
          authentication: 'required',
          description: 'The account and key behind the credential you sent.',
        },
        listings: {
          url: `${base}/api/v1/listings`,
          methods: ['GET', 'POST'],
          authentication: 'required',
          description:
            'GET lists every listing you own, whatever its review status. POST submits a new free listing for review.',
          fields: listingFields,
        },
        listing: {
          url: `${base}/api/v1/listings/{id}`,
          methods: ['GET', 'PATCH', 'DELETE'],
          authentication: 'required',
          description:
            'One of your listings. PATCH accepts any subset of the create fields. DELETE is permanent.',
        },
        keys: {
          url: `${base}/api/v1/keys`,
          methods: ['GET', 'POST'],
          authentication: 'required',
          description:
            'GET lists your API keys (prefix only). POST {"name"} creates one; the full key is returned exactly once.',
        },
        key: {
          url: `${base}/api/v1/keys/{id}`,
          methods: ['PATCH', 'DELETE'],
          authentication: 'required',
          description: 'PATCH {"name"} renames a key. DELETE revokes it immediately.',
        },
        cli_login: {
          url: `${base}/api/v1/auth/cli`,
          method: 'POST',
          description:
            'POST {"email"} emails a one-time code. Then POST {"email","code","key_name"} to /api/v1/auth/cli/verify to receive a new API key.',
        },
      },
      mcp: {
        url: `${base}/api/mcp`,
        transport: 'streamable-http',
        description:
          'Model Context Protocol server exposing the same directory as callable tools, plus listing management with an API key.',
      },
      llms_txt: `${base}/llms.txt`,
      terms: `${base}/terms`,
    },
    { cacheSeconds: 86400 },
  )
}
