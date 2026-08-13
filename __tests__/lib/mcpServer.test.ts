import { describe, it, expect, vi, beforeEach } from 'vitest'

// The distribution layer is server-only (it imports `server-only` and the
// service-role Supabase client), so it is mocked wholesale here. These tests
// cover the JSON-RPC protocol handling, not the database access.
const queryProducts = vi.fn()
const getProduct = vi.fn()
const listCategories = vi.fn()

vi.mock('@/lib/distribution', () => ({
  queryProducts: (...args: unknown[]) => queryProducts(...args),
  getProduct: (...args: unknown[]) => getProduct(...args),
  listCategories: (...args: unknown[]) => listCategories(...args),
  serializeProduct: (s: { id: string; title: string }) => ({ id: s.id, name: s.title }),
  MAX_PAGE_SIZE: 100,
}))

const { handleMcpMessage, TOOLS, DEFAULT_PROTOCOL_VERSION } = await import(
  '@/lib/mcpServer'
)

function resultOf(response: unknown) {
  return (response as { result: Record<string, unknown> }).result
}

function errorOf(response: unknown) {
  return (response as { error: { code: number; message: string } }).error
}

/** Tool results carry content blocks; unwrap the JSON we packed into the text. */
function parseToolText(response: unknown) {
  const result = resultOf(response) as { content: Array<{ text: string }> }
  return JSON.parse(result.content[0].text)
}

beforeEach(() => {
  vi.clearAllMocks()
  queryProducts.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 })
  getProduct.mockResolvedValue(null)
  listCategories.mockResolvedValue([])
})

describe('initialize', () => {
  it('echoes a supported protocol version back to the client', async () => {
    const res = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    })
    expect(resultOf(res).protocolVersion).toBe('2024-11-05')
  })

  it('falls back to the default for an unrecognised version', async () => {
    const res = await handleMcpMessage({
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '1999-01-01' },
    })
    expect(resultOf(res).protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION)
  })

  it('advertises tool capability and server identity', async () => {
    const res = await handleMcpMessage({ id: 1, method: 'initialize' })
    const result = resultOf(res)
    expect(result.capabilities).toEqual({ tools: { listChanged: false } })
    expect((result.serverInfo as { name: string }).name).toBe('saasrow')
  })
})

describe('protocol basics', () => {
  it('answers ping with an empty result', async () => {
    expect(resultOf(await handleMcpMessage({ id: 7, method: 'ping' }))).toEqual({})
  })

  it('returns no response for a notification', async () => {
    expect(
      await handleMcpMessage({ method: 'notifications/initialized' }),
    ).toBeNull()
  })

  it('rejects a message with no method', async () => {
    expect(errorOf(await handleMcpMessage({ id: 1 })).code).toBe(-32600)
  })

  it('reports method-not-found for an unknown method', async () => {
    const res = await handleMcpMessage({ id: 1, method: 'does/not/exist' })
    expect(errorOf(res).code).toBe(-32601)
  })

  it('preserves a null id on error responses', async () => {
    const res = await handleMcpMessage({ method: 'does/not/exist' })
    expect((res as { id: unknown }).id).toBeNull()
  })

  it('answers resource and prompt probes with empty lists', async () => {
    expect(resultOf(await handleMcpMessage({ id: 1, method: 'resources/list' }))).toEqual(
      { resources: [] },
    )
    expect(resultOf(await handleMcpMessage({ id: 2, method: 'prompts/list' }))).toEqual({
      prompts: [],
    })
  })
})

describe('tools/list', () => {
  it('lists every tool with a schema', async () => {
    const res = await handleMcpMessage({ id: 1, method: 'tools/list' })
    const tools = resultOf(res).tools as Array<{ name: string; inputSchema: unknown }>
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_product',
      'get_vocabulary',
      'list_categories',
      'search_products',
    ])
    for (const tool of tools) expect(tool.inputSchema).toBeTruthy()
  })

  it('matches the exported TOOLS constant', async () => {
    const res = await handleMcpMessage({ id: 1, method: 'tools/list' })
    expect((resultOf(res).tools as unknown[]).length).toBe(TOOLS.length)
  })
})

describe('tools/call search_products', () => {
  it('maps snake_case tool arguments onto the query layer', async () => {
    await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: {
        name: 'search_products',
        arguments: {
          query: 'analytics',
          use_case: 'analytics',
          pricing_model: 'free',
          alternative_to: 'Notion',
          sort: 'popular',
          limit: 5,
        },
      },
    })
    expect(queryProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'analytics',
        useCase: 'analytics',
        pricingModel: 'free',
        alternativeTo: 'Notion',
        sort: 'popular',
        limit: 5,
      }),
    )
  })

  it('defaults to a recent sort and a bounded limit', async () => {
    await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'search_products', arguments: {} },
    })
    expect(queryProducts).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'recent', limit: 10 }),
    )
  })

  it('ignores an invalid sort value rather than passing it through', async () => {
    await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'search_products', arguments: { sort: 'wat' } },
    })
    expect(queryProducts).toHaveBeenCalledWith(expect.objectContaining({ sort: 'recent' }))
  })

  it('returns the total alongside the page of results', async () => {
    queryProducts.mockResolvedValue({
      items: [{ id: 'a', title: 'Tool A' }],
      total: 42,
      limit: 10,
      offset: 0,
    })
    const res = await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'search_products', arguments: {} },
    })
    expect(parseToolText(res)).toEqual({
      total: 42,
      returned: 1,
      products: [{ id: 'a', name: 'Tool A' }],
    })
  })
})

describe('tools/call get_product', () => {
  it('returns the serialized product', async () => {
    getProduct.mockResolvedValue({ id: 'abc', title: 'Tool A' })
    const res = await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'get_product', arguments: { id: 'abc' } },
    })
    expect(parseToolText(res)).toEqual({ id: 'abc', name: 'Tool A' })
  })

  it('reports a tool error when the id is missing', async () => {
    const res = await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'get_product', arguments: {} },
    })
    expect(resultOf(res).isError).toBe(true)
    expect(getProduct).not.toHaveBeenCalled()
  })

  it('reports a tool error when nothing matches', async () => {
    const res = await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'get_product', arguments: { id: 'missing' } },
    })
    expect(resultOf(res).isError).toBe(true)
  })
})

describe('tools/call error handling', () => {
  it('flags an unknown tool as a tool error, not a protocol error', async () => {
    const res = await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'nope', arguments: {} },
    })
    expect(resultOf(res).isError).toBe(true)
  })

  it('rejects a call with a non-string tool name', async () => {
    const res = await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 123 },
    })
    expect(errorOf(res).code).toBe(-32602)
  })

  it('converts a thrown database error into a tool error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    queryProducts.mockRejectedValue(new Error('db exploded'))
    const res = await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'search_products', arguments: {} },
    })
    expect(resultOf(res).isError).toBe(true)
    // The underlying message is not leaked to the caller.
    expect(JSON.stringify(resultOf(res))).not.toContain('db exploded')
  })
})

describe('tools/call get_vocabulary', () => {
  it('returns the four vocabularies', async () => {
    const res = await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'get_vocabulary', arguments: {} },
    })
    const vocab = parseToolText(res)
    expect(Object.keys(vocab).sort()).toEqual([
      'audiences',
      'platforms',
      'pricing_models',
      'use_cases',
    ])
  })
})
