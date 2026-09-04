import { corsPreflight, errorToResponse, jsonResponse, readJsonBody, ApiError } from '@/lib/publicApi'
import { requirePrincipal, renameApiKey, revokeApiKey } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function OPTIONS() {
  return corsPreflight()
}

async function keyId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'No such API key')
  return id
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const id = await keyId(ctx)
    const body = (await readJsonBody(req)) as Record<string, unknown>
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw new ApiError(400, 'A non-empty "name" is required')
    }
    return jsonResponse({ data: await renameApiKey(principal.userId, id, body.name) })
  } catch (error) {
    return errorToResponse(error, 'api/v1/keys/[id]')
  }
}

/** Revoke. Takes effect on the next request, including one made with this key. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const id = await keyId(ctx)
    const revoked = await revokeApiKey(principal.userId, id)
    return jsonResponse({ data: revoked, revoked_current_key: principal.keyId === id })
  } catch (error) {
    return errorToResponse(error, 'api/v1/keys/[id]')
  }
}
