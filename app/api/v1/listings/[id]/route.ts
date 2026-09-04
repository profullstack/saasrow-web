import { corsPreflight, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { deleteOwnedListing, getOwnedListing, updateOwnedListing } from '@/lib/listings'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export function OPTIONS() {
  return corsPreflight()
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const { id } = await ctx.params
    return jsonResponse({ data: await getOwnedListing(principal, id) })
  } catch (error) {
    return errorToResponse(error, 'api/v1/listings/[id]')
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const { id } = await ctx.params
    const body = await readJsonBody(req)
    return jsonResponse({ data: await updateOwnedListing(principal, id, body) })
  } catch (error) {
    return errorToResponse(error, 'api/v1/listings/[id]')
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const principal = await requirePrincipal(req)
    const { id } = await ctx.params
    await deleteOwnedListing(principal, id)
    return jsonResponse({ deleted: true, id })
  } catch (error) {
    return errorToResponse(error, 'api/v1/listings/[id]')
  }
}
