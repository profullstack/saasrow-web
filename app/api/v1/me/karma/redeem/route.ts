import { corsPreflight, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { redeemCredit } from '@/lib/karma'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/** Spend one free Featured week (every 500 karma) on a listing you own: {listing_id}. */
export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    const body = (await readJsonBody(req)) as Record<string, unknown>
    return jsonResponse(await redeemCredit(principal, body.listing_id))
  } catch (error) {
    return errorToResponse(error, 'api/v1/me/karma/redeem')
  }
}
