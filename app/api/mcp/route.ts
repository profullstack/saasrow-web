import {
  handleMcpMessage,
  DEFAULT_PROTOCOL_VERSION,
  READ_TOOLS,
  WRITE_TOOLS,
  type JsonRpcRequest,
  type McpContext,
} from '@/lib/mcpServer'
import { recordAiRead } from '@/lib/distribution'
import { authenticate } from '@/lib/apiAuth'
import { jsonResponse, errorResponse, corsPreflight } from '@/lib/publicApi'
import { siteUrl } from '@/lib/structuredData'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return corsPreflight()
}

/**
 * A GET on an MCP endpoint is normally an SSE upgrade. We're stateless and
 * don't offer a server-initiated stream, so instead of a bare 405 we return a
 * human-readable description — this URL gets pasted into browsers a lot.
 */
export function GET() {
  const base = siteUrl()
  const summarize = (t: { name: string; description: string }) => ({
    name: t.name,
    description: t.description,
  })
  return jsonResponse({
    name: 'saasrow',
    description: 'MCP server for the SaaSRow software directory.',
    transport: 'streamable-http',
    endpoint: `${base}/api/mcp`,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    authentication: {
      read: 'none',
      write:
        'API key as `Authorization: Bearer sr_…`. Create one with `npx @profullstack/saasrow login` or from your listing management page.',
    },
    tools: {
      read: READ_TOOLS.map(summarize),
      write: WRITE_TOOLS.map(summarize),
    },
    usage: {
      claude_code: `claude mcp add --transport http saasrow ${base}/api/mcp`,
      claude_code_with_key: `claude mcp add --transport http saasrow ${base}/api/mcp --header "Authorization: Bearer sr_…"`,
      config: {
        mcpServers: {
          saasrow: {
            type: 'http',
            url: `${base}/api/mcp`,
            headers: { Authorization: 'Bearer sr_…' },
          },
        },
      },
    },
  })
}

export async function POST(req: Request) {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  // A bad key is reported per tool call rather than as a transport error, so
  // a client with a stale key can still use the read tools.
  let ctx: McpContext = {}
  try {
    ctx = { principal: await authenticate(req) }
  } catch (error) {
    console.error('[mcp] authentication failed', error)
  }

  void recordAiRead({
    userAgent: req.headers.get('user-agent'),
    channel: 'mcp',
    path: '/api/mcp',
  })

  // A client may batch messages into an array.
  if (Array.isArray(payload)) {
    const responses = (
      await Promise.all(payload.map((m) => handleMcpMessage(m as JsonRpcRequest, ctx)))
    ).filter((r) => r !== null)
    // An all-notification batch gets a bare 202 with no body.
    if (responses.length === 0) return new Response(null, { status: 202 })
    return jsonResponse(responses)
  }

  const response = await handleMcpMessage(payload as JsonRpcRequest, ctx)
  if (response === null) return new Response(null, { status: 202 })
  return jsonResponse(response)
}
