import { corsPreflight, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { requirePrincipal, listApiKeys, createApiKey } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/** Every key on the account, active and revoked. Prefixes only, never hashes. */
export async function GET(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    return jsonResponse({ data: await listApiKeys(principal.userId) })
  } catch (error) {
    return errorToResponse(error, 'api/v1/keys')
  }
}

/** Create a key. The plaintext comes back in this response and nowhere else. */
export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    const body = (await readJsonBody(req)) as Record<string, unknown>
    const created = await createApiKey(principal.userId, body.name)
    return jsonResponse(created, { status: 201 })
  } catch (error) {
    return errorToResponse(error, 'api/v1/keys')
  }
}
