// Shared plumbing for the public API surface.
//
// Reading the directory is deliberately open: no key, no signup. The whole
// point of the distribution layer is that an agent can reach the directory
// without a human in the loop, and an API key is a human in the loop.
//
// Writing to it (creating and managing listings, managing keys) needs an
// account, authenticated per request with an API key — see src/lib/apiAuth.ts.

export const API_VERSION = 'v1'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, Authorization, X-Management-Token, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
}

/**
 * An error the caller should see: carries the HTTP status. Anything else
 * thrown inside a route is a bug and surfaces as a generic 500.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; cacheSeconds?: number; headers?: Record<string, string> } = {},
): Response {
  const { status = 200, cacheSeconds, headers = {} } = init
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...(cacheSeconds
        ? {
            'Cache-Control': `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 4}`,
          }
        : {}),
      ...headers,
    },
  })
}

export function textResponse(
  body: string,
  init: { status?: number; contentType?: string; cacheSeconds?: number } = {},
): Response {
  const { status = 200, contentType = 'text/plain; charset=utf-8', cacheSeconds } = init
  return new Response(body, {
    status,
    headers: {
      'Content-Type': contentType,
      ...CORS_HEADERS,
      ...(cacheSeconds
        ? {
            'Cache-Control': `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 4}`,
          }
        : {}),
    },
  })
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: { status, message } }, { status })
}

/**
 * Turn whatever a route threw into a response. ApiErrors are the caller's
 * problem and say so; everything else is logged and hidden behind a 500.
 */
export function errorToResponse(error: unknown, context: string): Response {
  if (error instanceof ApiError) return errorResponse(error.message, error.status)
  console.error(`[${context}]`, error)
  return errorResponse('Internal error', 500)
}

/** Parse a JSON body, turning malformed input into a 400 rather than a 500. */
export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }
}

/** Every public route exports this so browsers can preflight cross-origin. */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/** Parse an integer query param, ignoring junk rather than erroring. */
export function intParam(params: URLSearchParams, name: string): number | undefined {
  const raw = params.get(name)
  if (raw === null) return undefined
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function stringParam(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name)
  if (raw === null) return undefined
  const trimmed = raw.trim()
  return trimmed ? trimmed.slice(0, 200) : undefined
}
