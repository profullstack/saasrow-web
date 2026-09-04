import { corsPreflight, errorToResponse, jsonResponse, readJsonBody } from '@/lib/publicApi'
import { requirePrincipal } from '@/lib/apiAuth'
import { createListing, listOwnedListings } from '@/lib/listings'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/** Everything the account owns, pending and rejected included. */
export async function GET(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    const data = await listOwnedListings(principal)
    return jsonResponse({ data, total: data.length })
  } catch (error) {
    return errorToResponse(error, 'api/v1/listings')
  }
}

/** Submit a free listing. It lands in the review queue like a website submission. */
export async function POST(req: Request) {
  try {
    const principal = await requirePrincipal(req)
    const body = await readJsonBody(req)
    const listing = await createListing(principal, body)
    return jsonResponse(
      {
        data: listing,
        message: 'Listing submitted. It will appear in the directory once reviewed.',
      },
      { status: 201 },
    )
  } catch (error) {
    return errorToResponse(error, 'api/v1/listings')
  }
}
