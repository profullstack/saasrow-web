import { corsPreflight, errorToResponse, intParam, jsonResponse } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { karmaSummary } from '@/lib/karma'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/** Your karma: total, this week, badges, free Featured weeks, history. */
export async function GET(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    const limit = intParam(new URL(req.url).searchParams, 'limit') ?? 30
    return jsonResponse({ email: principal.email, ...(await karmaSummary(principal, limit)) })
  } catch (error) {
    return errorToResponse(error, 'api/v1/me/karma')
  }
}
