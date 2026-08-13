import { getDistributionStats } from '@/lib/distribution'
import { knownBotNames } from '@/lib/aiClients'
import { jsonResponse, errorResponse, corsPreflight } from '@/lib/publicApi'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

export async function GET() {
  try {
    const stats = await getDistributionStats()
    return jsonResponse(
      {
        data: {
          listings: stats.listings,
          categories: stats.categories,
          upvotes: stats.upvotes,
          listing_views: stats.views,
          ai_reads_30d: stats.aiReadsLast30Days,
          distinct_ai_clients_30d: stats.distinctBotsLast30Days,
        },
        // Stating the method inline keeps us honest: these are counted events,
        // not estimates, and anyone can check the definition against the code.
        methodology: {
          ai_reads_30d:
            'One event per request in the last 30 days from a recognised AI crawler user-agent, or from any client of the public API / MCP server. Ordinary browser traffic is excluded.',
          recognised_clients: knownBotNames(),
          upvotes: 'Sum of upvotes across approved listings.',
          listing_views: 'Sum of view counts across approved listings.',
        },
      },
      { cacheSeconds: 300 },
    )
  } catch (error) {
    console.error('[api/v1/stats]', error)
    return errorResponse('Failed to load stats', 500)
  }
}
