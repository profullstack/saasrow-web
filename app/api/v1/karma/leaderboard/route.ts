import { corsPreflight, errorToResponse, intParam, jsonResponse } from '@/lib/publicApi'
import { leaderboard } from '@/lib/karma'
import { parsePeriod } from '@/lib/karmaRules'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/** Top karma for a period (week, month or all). Staff are never ranked. */
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams
    const period = parsePeriod(params.get('period'))
    const limit = Math.min(Math.max(intParam(params, 'limit') ?? 25, 1), 100)
    return jsonResponse({ period, rows: await leaderboard(period, limit) }, { cacheSeconds: 60 })
  } catch (error) {
    return errorToResponse(error, 'api/v1/karma/leaderboard')
  }
}
