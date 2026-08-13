import {
  handleMcpMessage,
  DEFAULT_PROTOCOL_VERSION,
  TOOLS,
  type JsonRpcRequest,
} from '@/lib/mcpServer'
import { recordAiRead } from '@/lib/distribution'
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
  return jsonResponse({
    name: 'saasrow',
    description: 'MCP server for the SaaSRow software directory.',
    transport: 'streamable-http',
    endpoint: `${base}/api/mcp`,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    authentication: 'none',
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    usage: {
      claude_code: `claude mcp add --transport http saasrow ${base}/api/mcp`,
      config: {
        mcpServers: { saasrow: { type: 'http', url: `${base}/api/mcp` } },
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

  void recordAiRead({
    userAgent: req.headers.get('user-agent'),
    channel: 'mcp',
    path: '/api/mcp',
  })

  // A client may batch messages into an array.
  if (Array.isArray(payload)) {
    const responses = (
      await Promise.all(payload.map((m) => handleMcpMessage(m as JsonRpcRequest)))
    ).filter((r) => r !== null)
    // An all-notification batch gets a bare 202 with no body.
    if (responses.length === 0) return new Response(null, { status: 202 })
    return jsonResponse(responses)
  }

  const response = await handleMcpMessage(payload as JsonRpcRequest)
  if (response === null) return new Response(null, { status: 202 })
  return jsonResponse(response)
}
