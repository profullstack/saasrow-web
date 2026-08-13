import type { Metadata } from 'next'
import Distribution from '@/views/Distribution'
import { getDistributionStats, type DistributionStats } from '@/lib/distribution'
import { knownBotNames } from '@/lib/aiClients'
import { siteUrl } from '@/lib/structuredData'

// Stats are live but cheap to serve stale for a few minutes.
export const revalidate = 300

export const metadata: Metadata = {
  title: 'Distribution',
  description:
    'List once and get found everywhere: AI assistants, search engines, a free public API and an MCP server.',
  alternates: { canonical: '/distribution' },
  openGraph: {
    title: 'Distribution | SaaSRow',
    description:
      'List once and get found everywhere: AI assistants, search engines, a free public API and an MCP server.',
    url: '/distribution',
    type: 'website',
  },
}

const EMPTY_STATS: DistributionStats = {
  listings: 0,
  aiReadsLast30Days: 0,
  distinctBotsLast30Days: 0,
  upvotes: 0,
  views: 0,
  categories: 0,
}

export default async function Page() {
  // A stats outage should degrade to zeroes, not a 500 on a marketing page.
  const stats = await getDistributionStats().catch((error) => {
    console.error('[distribution] stats failed', error)
    return EMPTY_STATS
  })

  return (
    <Distribution
      stats={stats}
      siteUrl={siteUrl()}
      botCount={knownBotNames().length}
    />
  )
}
