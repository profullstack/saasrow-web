import { forwardToEdge } from '@/lib/edgeProxy'
import { authenticate } from '@/lib/apiAuth'
import { ADULT_SIGN_IN_MESSAGE, isAdultCategory } from '@/lib/adultShared'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ name: string }> }

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { name } = await ctx.params
  if (!/^[a-z0-9-]+$/.test(name)) {
    return new Response(JSON.stringify({ error: 'Invalid function name' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  // Submitting to the Adult (18+) category needs a signed-in member. Only this
  // one request is read here; everything else streams through untouched.
  if (name === 'submissions' && (req.method === 'POST' || req.method === 'PATCH')) {
    const body = await req.clone().json().catch(() => null)
    const category = body?.category ?? body?.submission?.category
    if (isAdultCategory(category) && !(await authenticate(req))) {
      return new Response(JSON.stringify({ error: ADULT_SIGN_IN_MESSAGE }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
  try {
    return await forwardToEdge(name, req)
  } catch (err) {
    console.error(`[/api/fn/${name}] proxy error:`, err)
    return new Response(JSON.stringify({ error: 'Proxy error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
