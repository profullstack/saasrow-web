// A minimal Model Context Protocol server.
//
// Implemented directly against the JSON-RPC wire format rather than pulling in
// the MCP SDK: the surface is a handful of tools, and the SDK's transport
// abstractions assume a long-lived process rather than a serverless handler.
//
// Transport is "streamable HTTP": the client POSTs a JSON-RPC request and gets
// a JSON-RPC response back. We are stateless -- no session id, no SSE stream --
// which is a legal subset and means any instance can serve any request.
//
// Reading tools are open. Writing tools (your own listings) need the caller
// to have sent an API key; the route resolves it and passes it in as context.

import {
  queryProducts,
  getProduct,
  listCategories,
  serializeProduct,
  MAX_PAGE_SIZE,
} from './distribution'
import {
  createListing,
  listOwnedListings,
  getOwnedListing,
  updateOwnedListing,
  deleteOwnedListing,
} from './listings'
import { vocabularyManifest } from './vocab'
import { siteUrl } from './structuredData'
import { ApiError } from './publicApi'
import { LISTING_LIMITS } from './listingInput'
import type { ApiPrincipal } from './apiAuth'

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
export const DEFAULT_PROTOCOL_VERSION = '2025-06-18'

export interface JsonRpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

/** Per-request context: who, if anyone, the caller authenticated as. */
export interface McpContext {
  principal?: ApiPrincipal | null
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

const VOCAB_HINT = 'Controlled vocabulary term; call get_vocabulary for the list.'

/** Fields a maker may set on their listing; shared by create and update. */
const LISTING_PROPERTIES = {
  name: { type: 'string', description: `Product name (max ${LISTING_LIMITS.title} characters).` },
  website: { type: 'string', description: 'Product website URL.' },
  description: {
    type: 'string',
    description: `What the product does (max ${LISTING_LIMITS.description} characters).`,
  },
  category: { type: 'string', description: 'Category name; call list_categories for what exists.' },
  tags: {
    type: 'array',
    items: { type: 'string' },
    description: `Free-text tags (max ${LISTING_LIMITS.tags}).`,
  },
  use_cases: { type: 'array', items: { type: 'string' }, description: VOCAB_HINT },
  audiences: { type: 'array', items: { type: 'string' }, description: VOCAB_HINT },
  platforms: { type: 'array', items: { type: 'string' }, description: VOCAB_HINT },
  pricing_model: { type: 'string', description: VOCAB_HINT },
  alternatives: {
    type: 'array',
    items: { type: 'string' },
    description: 'Names of products this one is an alternative to (max 10).',
  },
} as const

export const READ_TOOLS = [
  {
    name: 'search_products',
    description:
      'Search the SaaSRow software directory. Combine filters to narrow results, e.g. find free self-hosted analytics tools for developers, or products positioned as an alternative to a named competitor.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search over name and description.' },
        category: { type: 'string', description: 'Category name.' },
        use_case: { type: 'string', description: VOCAB_HINT },
        audience: { type: 'string', description: VOCAB_HINT },
        platform: { type: 'string', description: VOCAB_HINT },
        pricing_model: { type: 'string', description: VOCAB_HINT },
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

const AUTH_NOTE =
  'Requires an API key sent as an Authorization: Bearer header on the MCP connection.'

export const WRITE_TOOLS = [
  {
    name: 'create_listing',
    description: `Submit a free listing for a product you make. It is reviewed before it appears in the directory. ${AUTH_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: LISTING_PROPERTIES,
      required: ['name', 'website', 'description'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_my_listings',
    description: `List every listing owned by the authenticated account, including ones still pending review. ${AUTH_NOTE}`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_my_listing',
    description: `Fetch one of your own listings by id, whatever its review status. ${AUTH_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The listing id (uuid).' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_listing',
    description: `Change fields on one of your own listings. Only the fields supplied are changed. ${AUTH_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The listing id (uuid).' }, ...LISTING_PROPERTIES },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_listing',
    description: `Permanently delete one of your own listings. ${AUTH_NOTE}`,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The listing id (uuid).' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
] as const

export const TOOLS = [...READ_TOOLS, ...WRITE_TOOLS] as const

const WRITE_TOOL_NAMES = new Set<string>(WRITE_TOOLS.map((t) => t.name))

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

function requireId(args: Record<string, unknown>): string | null {
  return typeof args.id === 'string' && args.id ? args.id : null
}

async function callTool(name: string, args: Record<string, unknown>, ctx: McpContext) {
  if (WRITE_TOOL_NAMES.has(name) && !ctx.principal) {
    return toolError(
      `${name} needs an account. Connect with an API key: ` +
        `claude mcp add --transport http saasrow ${siteUrl()}/api/mcp --header "Authorization: Bearer sr_…". ` +
        'Create a key with `npx @profullstack/saasrow login` or from your listing management page.',
    )
  }
  const principal = ctx.principal as ApiPrincipal

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
      const id = requireId(args)
      if (!id) return toolError('get_product requires a string "id" argument.')
      const product = await getProduct(id)
      if (!product) return toolError(`No approved product found with id ${id}.`)
      return toolResult(serializeProduct(product))
    }
    case 'list_categories':
      return toolResult({ categories: await listCategories() })
    case 'get_vocabulary':
      return toolResult(vocabularyManifest())

    case 'create_listing':
      return toolResult(await createListing(principal, args))
    case 'list_my_listings': {
      const listings = await listOwnedListings(principal)
      return toolResult({ total: listings.length, listings })
    }
    case 'get_my_listing': {
      const id = requireId(args)
      if (!id) return toolError('get_my_listing requires a string "id" argument.')
      return toolResult(await getOwnedListing(principal, id))
    }
    case 'update_listing': {
      const { id, ...patch } = args
      if (typeof id !== 'string' || !id) return toolError('update_listing requires a string "id" argument.')
      return toolResult(await updateOwnedListing(principal, id, patch))
    }
    case 'delete_listing': {
      const id = requireId(args)
      if (!id) return toolError('delete_listing requires a string "id" argument.')
      await deleteOwnedListing(principal, id)
      return toolResult({ deleted: true, id })
    }
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
  ctx: McpContext = {},
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
      const who = ctx.principal ? ` You are connected as ${ctx.principal.email}.` : ''
      return ok(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'saasrow', version: '1.1.0', websiteUrl: siteUrl() },
        instructions:
          'SaaSRow is a directory of software and SaaS products. Use search_products to find tools by use case, audience, platform, pricing model, or as an alternative to a named competitor. Call get_vocabulary first if you need the exact filter terms. ' +
          'With an API key you can also create_listing for a product you make and manage it with list_my_listings, update_listing and delete_listing.' +
          who,
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
        return ok(id, await callTool(name, args, ctx))
      } catch (error) {
        // Validation, ownership and conflict errors are the caller's to fix.
        if (error instanceof ApiError) return ok(id, toolError(error.message))
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
