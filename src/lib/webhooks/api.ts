import 'server-only'
import { webhooksApi } from '@profullstack/webhooks'
import { requirePrincipal } from '../apiAuth'
import { getHooks } from './hub'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Management-Token',
}

/**
 * Authenticate (401 via ApiError when there is no valid credential), then hand
 * the request to the package's router with the account as the owner. Null for
 * a path outside /api/v1/webhooks.
 */
export async function handleWebhooksRequest(req: Request): Promise<Response | null> {
  const principal = await requirePrincipal(req)
  const api = webhooksApi(getHooks(), { basePath: '/api/v1/webhooks', owner: () => principal.userId })
  const res = await api(req)
  if (!res) return null
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  headers.set('Cache-Control', 'no-store')
  return new Response(res.body, { status: res.status, headers })
}
