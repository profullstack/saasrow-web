import { corsPreflight, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { redeemCreditCode } from '@/lib/credits'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/** Redeem a credit code for days of Premium: {code}. */
export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const result = await redeemCreditCode(principal, body.code)
    if (!result.ok) return jsonResponse({ error: { message: result.message }, reason: result.reason }, { status: 400 })
    return jsonResponse(result)
  } catch (error) {
    return errorToResponse(error, 'api/v1/me/credits/redeem')
  }
}
