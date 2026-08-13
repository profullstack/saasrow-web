// A minimal Model Context Protocol server.
//
// Implemented directly against the JSON-RPC wire format rather than pulling in
// the MCP SDK: the surface is four read-only tools, and the SDK's transport
// abstractions assume a long-lived process rather than a serverless handler.
//
// Transport is "streamable HTTP": the client POSTs a JSON-RPC request and gets
// a JSON-RPC response back. We are stateless -- no session id, no SSE stream --
// which is a legal subset and means any instance can serve any request.

import {
  queryProducts,
  getProduct,
  listCategories,
  serializeProduct,
  MAX_PAGE_SIZE,
} from './distribution'
import { vocabularyManifest } from './vocab'
import { siteUrl } from './structuredData'

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
export const DEFAULT_PROTOCOL_VERSION = '2025-06-18'

export interface JsonRpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

type JsonRpcResult = { jsonrpc: '2.0'; id: string | number | null; result: unknown }
type JsonRpcError = {
  jsonrpc: '2.0'
  id: string | number | null
  error: { code: number; message: string }
}
export type JsonRpcResponse = JsonRpcResult | JsonRpcError

const ok = (id: string | number | null, result: unknown): JsonRpcResult => ({
  jsonrpc: '2.0',
  id,
  result,
})

const fail = (
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcError => ({ jsonrpc: '2.0', id, error: { code, message } })

export const TOOLS = [
  {
    name: 'search_products',
    description:
      'Search the SaaSRow software directory. Combine filters to narrow results, e.g. find free self-hosted analytics tools for developers, or products positioned as an alternative to a named competitor.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search over name and description.' },
        category: { type: 'string', description: 'Category name.' },
        use_case: {
          type: 'string',
          description: 'Controlled vocabulary term; call get_vocabulary for the list.',
        },
        audience: {
          type: 'string',
          description: 'Controlled vocabulary term; call get_vocabulary for the list.',
        },
        platform: {
          type: 'string',
          description: 'Controlled vocabulary term; call get_vocabulary for the list.',
        },
        pricing_model: {
          type: 'string',
          description: 'Controlled vocabulary term; call get_vocabulary for the list.',
        },
        alternative_to: {
          type: 'string',
          description: 'Find products positioned as an alternative to this product name.',
        },
        sort: { type: 'string', enum: ['recent', 'popular', 'views'] },
        limit: {
          type: 'integer',
          description: `Maximum results to return (1-${MAX_PAGE_SIZE}).`,
          minimum: 1,
          maximum: MAX_PAGE_SIZE,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_product',
    description: 'Fetch one product from the SaaSRow directory by its id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The product id (uuid).' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_categories',
    description: 'List every category in the directory with the number of products in each.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_vocabulary',
    description:
      'List the controlled vocabulary accepted by the use_case, audience, platform and pricing_model filters.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const

/** MCP tool results carry content blocks; we return compact JSON as text. */
function toolResult(payload: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  }
}

function toolError(message: string) {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  }
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'search_products': {
      const page = await queryProducts({
        q: typeof args.query === 'string' ? args.query : undefined,
        category: typeof args.category === 'string' ? args.category : undefined,
        useCase: typeof args.use_case === 'string' ? args.use_case : undefined,
        audience: typeof args.audience === 'string' ? args.audience : undefined,
        platform: typeof args.platform === 'string' ? args.platform : undefined,
        pricingModel:
          typeof args.pricing_model === 'string' ? args.pricing_model : undefined,
        alternativeTo:
          typeof args.alternative_to === 'string' ? args.alternative_to : undefined,
        sort: args.sort === 'popular' || args.sort === 'views' ? args.sort : 'recent',
        limit: typeof args.limit === 'number' ? args.limit : 10,
      })
      return toolResult({
        total: page.total,
        returned: page.items.length,
        products: page.items.map(serializeProduct),
      })
    }
    case 'get_product': {
      if (typeof args.id !== 'string' || !args.id) {
        return toolError('get_product requires a string "id" argument.')
      }
      const product = await getProduct(args.id)
      if (!product) return toolError(`No approved product found with id ${args.id}.`)
      return toolResult(serializeProduct(product))
    }
    case 'list_categories':
      return toolResult({ categories: await listCategories() })
    case 'get_vocabulary':
      return toolResult(vocabularyManifest())
    default:
      return toolError(`Unknown tool: ${name}`)
  }
}

/**
 * Handle one JSON-RPC message. Returns null for notifications, which by spec
 * get no response body.
 */
export async function handleMcpMessage(
  message: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  const id = message.id ?? null
  const method = message.method

  if (!method) return fail(id, -32600, 'Invalid Request: missing method')

  // Notifications carry no id and expect no reply.
  if (method.startsWith('notifications/')) return null

  switch (method) {
    case 'initialize': {
      const requested = (message.params?.protocolVersion as string) ?? ''
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL_VERSION
      return ok(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'saasrow', version: '1.0.0', websiteUrl: siteUrl() },
        instructions:
          'SaaSRow is a directory of software and SaaS products. Use search_products to find tools by use case, audience, platform, pricing model, or as an alternative to a named competitor. Call get_vocabulary first if you need the exact filter terms.',
      })
    }
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: TOOLS })
    case 'tools/call': {
      const name = message.params?.name
      if (typeof name !== 'string') {
        return fail(id, -32602, 'Invalid params: "name" must be a string')
      }
      const args = (message.params?.arguments as Record<string, unknown>) ?? {}
      try {
        return ok(id, await callTool(name, args))
      } catch (error) {
        console.error('[mcp] tool call failed', name, error)
        return ok(id, toolError(`Tool "${name}" failed.`))
      }
    }
    // Advertised as unsupported in capabilities, but answer politely rather
    // than erroring, since some clients probe regardless.
    case 'resources/list':
      return ok(id, { resources: [] })
    case 'prompts/list':
      return ok(id, { prompts: [] })
    default:
      return fail(id, -32601, `Method not found: ${method}`)
  }
}
