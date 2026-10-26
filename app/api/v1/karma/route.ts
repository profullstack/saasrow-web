import { corsPreflight, errorToResponse, jsonResponse } from '@/lib/publicApi'
import { karmaRules } from '@/lib/karma'
import { FEATURED_WEEK_DAYS, KARMA_PER_CREDIT, MIN_REVIEW_CHARS, SHARE_NETWORKS } from '@/lib/karmaRules'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/** How karma is earned: the same table as built.indie and pwamart. Open, no key. */
export async function GET() {
  try {
    return jsonResponse(
      {
        how_to_earn: await karmaRules(),
        per_credit: KARMA_PER_CREDIT,
        credit: `${FEATURED_WEEK_DAYS} days Featured for one of your listings`,
        min_review_chars: MIN_REVIEW_CHARS,
        share_networks: SHARE_NETWORKS,
        leaderboard: '/api/v1/karma/leaderboard?period=week|month|all',
        me: '/api/v1/me/karma',
      },
      { cacheSeconds: 300 },
    )
  } catch (error) {
    return errorToResponse(error, 'api/v1/karma')
  }
}
