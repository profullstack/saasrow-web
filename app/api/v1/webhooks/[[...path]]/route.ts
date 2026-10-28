import { corsPreflight, errorResponse, errorToResponse } from '@/lib/publicApi'
import { handleWebhooksRequest } from '@/lib/webhooks/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * /api/v1/webhooks: the @profullstack/webhooks API, scoped to the caller's
 * account. Same credentials as the rest of the write API (src/lib/apiAuth.ts):
 * an API key (Authorization: Bearer sr_…), a listing management token
 * (X-Management-Token), or the signed-in website member.
 *
 *   GET    /                      endpoints + event_types
 *   POST   /                      { url, events?, description? } -> { endpoint, secret }
 *   GET|PATCH|DELETE /:id
 *   GET    /:id/secret            POST /:id/rotate      POST /:id/test
 *   GET    /:id/deliveries        GET /deliveries       POST /deliveries/:id/retry
 */
async function handle(req: Request): Promise<Response> {
  try {
    return (await handleWebhooksRequest(req)) ?? errorResponse('Not found', 404)
  } catch (error) {
    return errorToResponse(error, 'api/v1/webhooks')
  }
}

export const OPTIONS = () => corsPreflight()
export const GET = handle
export const POST = handle
export const PATCH = handle
export const PUT = handle
export const DELETE = handle
