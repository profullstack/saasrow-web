import { forwardToEdge } from '@/lib/edgeProxy'

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
