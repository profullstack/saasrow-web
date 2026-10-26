import { adminTokenFromRequest, jsonResponse, unauthorized, validateAdminToken } from '@/lib/adminAuth'
import { ApiError } from '@/lib/publicApi'
import { getCredits, mintPremiumCode } from '@/lib/credits'

export const dynamic = 'force-dynamic'

// Admin: credit codes for days of Premium. X-Admin-Token like every admin route.
//   GET                                     list codes (never the plaintext)
//   POST {days, label?, max_redemptions?, expires_in_days?}   mint; the code is shown once
//   DELETE ?id=crd_...                      revoke

function fail(error: unknown): Response {
  if (error instanceof ApiError) return jsonResponse({ error: error.message }, error.status)
  console.error('[admin/credit-codes]', error)
  return jsonResponse({ error: 'Internal error' }, 500)
}

export async function GET(req: Request) {
  const { ok } = await validateAdminToken(adminTokenFromRequest(req))
  if (!ok) return unauthorized()
  try {
    return jsonResponse({ codes: await getCredits().list() })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(req: Request) {
  const admin = await validateAdminToken(adminTokenFromRequest(req))
  if (!admin.ok) return unauthorized()
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const minted = await mintPremiumCode({
      days: body.days,
      label: body.label,
      maxRedemptions: body.max_redemptions,
      expiresInDays: body.expires_in_days,
      createdBy: admin.email,
    })
    return jsonResponse(minted, 201)
  } catch (error) {
    return fail(error)
  }
}

export async function DELETE(req: Request) {
  const { ok } = await validateAdminToken(adminTokenFromRequest(req))
  if (!ok) return unauthorized()
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return jsonResponse({ error: 'id is required' }, 400)
    await getCredits().revoke(id)
    return jsonResponse({ revoked: true, id })
  } catch (error) {
    return fail(error)
  }
}
