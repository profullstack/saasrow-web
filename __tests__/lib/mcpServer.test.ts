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

// The owned-listing layer is server-only too. `ApiError` is real so the
// handler's "caller's fault vs bug" split is exercised.
const createListing = vi.fn()
const listOwnedListings = vi.fn()
const getOwnedListing = vi.fn()
const updateOwnedListing = vi.fn()
const deleteOwnedListing = vi.fn()

vi.mock('@/lib/listings', () => ({
  createListing: (...args: unknown[]) => createListing(...args),
  listOwnedListings: (...args: unknown[]) => listOwnedListings(...args),
  getOwnedListing: (...args: unknown[]) => getOwnedListing(...args),
  updateOwnedListing: (...args: unknown[]) => updateOwnedListing(...args),
  deleteOwnedListing: (...args: unknown[]) => deleteOwnedListing(...args),
}))

// Karma reads and writes go through Postgres functions; mocked like the rest.
const karmaRules = vi.fn()
const leaderboard = vi.fn()
const karmaSummary = vi.fn()
const redeemCredit = vi.fn()

vi.mock('@/lib/karma', () => ({
  karmaRules: (...args: unknown[]) => karmaRules(...args),
  leaderboard: (...args: unknown[]) => leaderboard(...args),
  karmaSummary: (...args: unknown[]) => karmaSummary(...args),
  redeemCredit: (...args: unknown[]) => redeemCredit(...args),
}))

// Credit codes and invites: server-only, mocked.
const redeemCreditCode = vi.fn()
const inviteOverview = vi.fn()
const createInviteFor = vi.fn()

vi.mock('@/lib/credits', () => ({
  redeemCreditCode: (...args: unknown[]) => redeemCreditCode(...args),
  inviteOverview: (...args: unknown[]) => inviteOverview(...args),
  createInviteFor: (...args: unknown[]) => createInviteFor(...args),
}))

const { handleMcpMessage, TOOLS, DEFAULT_PROTOCOL_VERSION } = await import(
  '@/lib/mcpServer'
)
const { ApiError } = await import('@/lib/publicApi')

const principal = {
  userId: 'u1',
  email: 'me@example.com',
  keyId: 'k1',
  via: 'api_key' as const,
}

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
      'create_invite',
      'create_listing',
      'delete_listing',
      'get_my_listing',
      'get_product',
      'get_vocabulary',
      'karma_leaderboard',
      'karma_rules',
      'list_categories',
      'list_my_listings',
      'my_invites',
      'my_karma',
      'redeem_credit_code',
      'redeem_karma_credit',
      'search_products',
      'update_listing',
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

describe('write tools', () => {
  it('refuses every write tool without a principal, and says how to get one', async () => {
    for (const name of ['create_listing', 'list_my_listings', 'get_my_listing', 'update_listing', 'delete_listing']) {
      const res = await handleMcpMessage({
        id: 1,
        method: 'tools/call',
        params: { name, arguments: { id: 'x' } },
      })
      const result = resultOf(res) as { isError: boolean; content: Array<{ text: string }> }
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Authorization: Bearer')
    }
    expect(createListing).not.toHaveBeenCalled()
    expect(deleteOwnedListing).not.toHaveBeenCalled()
  })

  it('read tools still work without a principal', async () => {
    const res = await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'list_categories', arguments: {} },
    })
    expect(resultOf(res).isError).toBeUndefined()
  })

  it('create_listing passes the principal and the raw arguments through', async () => {
    createListing.mockResolvedValue({ id: 'l1', name: 'Acme', status: 'pending' })
    const args = { name: 'Acme', website: 'https://acme.example', description: 'd' }
    const res = await handleMcpMessage(
      { id: 1, method: 'tools/call', params: { name: 'create_listing', arguments: args } },
      { principal },
    )
    expect(createListing).toHaveBeenCalledWith(principal, args)
    expect(parseToolText(res)).toEqual({ id: 'l1', name: 'Acme', status: 'pending' })
  })

  it('update_listing splits the id from the patch', async () => {
    updateOwnedListing.mockResolvedValue({ id: 'l1' })
    await handleMcpMessage(
      {
        id: 1,
        method: 'tools/call',
        params: { name: 'update_listing', arguments: { id: 'l1', description: 'new' } },
      },
      { principal },
    )
    expect(updateOwnedListing).toHaveBeenCalledWith(principal, 'l1', { description: 'new' })
  })

  it('delete_listing reports what it deleted', async () => {
    deleteOwnedListing.mockResolvedValue(undefined)
    const res = await handleMcpMessage(
      { id: 1, method: 'tools/call', params: { name: 'delete_listing', arguments: { id: 'l1' } } },
      { principal },
    )
    expect(deleteOwnedListing).toHaveBeenCalledWith(principal, 'l1')
    expect(parseToolText(res)).toEqual({ deleted: true, id: 'l1' })
  })

  it('surfaces an ApiError message as a tool error without logging it as a bug', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    createListing.mockRejectedValue(new ApiError(409, 'This website is already listed: "Acme" (approved)'))
    const res = await handleMcpMessage(
      { id: 1, method: 'tools/call', params: { name: 'create_listing', arguments: {} } },
      { principal },
    )
    const result = resultOf(res) as { isError: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('already listed')
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('mentions the connected account in initialize instructions', async () => {
    const res = await handleMcpMessage({ id: 1, method: 'initialize' }, { principal })
    expect(resultOf(res).instructions).toContain('me@example.com')
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

describe('karma tools', () => {
  it('karma_leaderboard is open and clamps its arguments', async () => {
    leaderboard.mockResolvedValue([{ rank: 1, player: 'abc', name: 'Ada', karma: 12 }])
    const res = await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'karma_leaderboard', arguments: { period: 'decade', limit: 500 } },
    })
    expect(leaderboard).toHaveBeenCalledWith('week', 100)
    expect(parseToolText(res)).toEqual({ period: 'week', rows: [{ rank: 1, player: 'abc', name: 'Ada', karma: 12 }] })
  })

  it('my_karma needs an API key', async () => {
    const res = await handleMcpMessage({ id: 1, method: 'tools/call', params: { name: 'my_karma', arguments: {} } })
    expect(resultOf(res).isError).toBe(true)
    expect(karmaSummary).not.toHaveBeenCalled()
  })

  it('redeem_karma_credit passes the caller and listing through', async () => {
    redeemCredit.mockResolvedValue({ featured: true, featured_until: '2026-11-02T00:00:00Z', credits_left: 0 })
    const res = await handleMcpMessage(
      { id: 1, method: 'tools/call', params: { name: 'redeem_karma_credit', arguments: { listing_id: 'l1' } } },
      { principal },
    )
    expect(redeemCredit).toHaveBeenCalledWith(principal, 'l1')
    expect(parseToolText(res).featured).toBe(true)
  })
})

describe('credit codes and invites over MCP', () => {
  beforeEach(() => {
    redeemCreditCode.mockReset()
    inviteOverview.mockReset()
    createInviteFor.mockReset()
  })

  it('redeem_credit_code needs an account', async () => {
    const res = await handleMcpMessage({
      id: 1,
      method: 'tools/call',
      params: { name: 'redeem_credit_code', arguments: { code: 'CR-1' } },
    })
    expect((resultOf(res) as { isError?: boolean }).isError).toBe(true)
    expect(redeemCreditCode).not.toHaveBeenCalled()
  })

  it('redeem_credit_code returns the grant, or the refusal as a tool error', async () => {
    redeemCreditCode.mockResolvedValueOnce({ ok: true, unit: 'premium_days', days: 30, premium: { premium: true } })
    const ok = await handleMcpMessage(
      { id: 1, method: 'tools/call', params: { name: 'redeem_credit_code', arguments: { code: 'CR-AAAA' } } },
      { principal },
    )
    expect(redeemCreditCode).toHaveBeenCalledWith(principal, 'CR-AAAA')
    expect(parseToolText(ok).days).toBe(30)

    redeemCreditCode.mockResolvedValueOnce({ ok: false, reason: 'used_up', message: 'That code has already been used.' })
    const refused = await handleMcpMessage(
      { id: 2, method: 'tools/call', params: { name: 'redeem_credit_code', arguments: { code: 'CR-AAAA' } } },
      { principal },
    )
    expect((resultOf(refused) as { isError?: boolean }).isError).toBe(true)
  })

  it('create_invite builds links from the request host', async () => {
    createInviteFor.mockResolvedValue({ id: 'i1', code: 'INV-1', url: 'x' })
    const request = new Request('http://localhost:3000/api/mcp', { headers: { host: 'localhost:3000' } })
    await handleMcpMessage(
      { id: 1, method: 'tools/call', params: { name: 'create_invite', arguments: { note: 'for Carol' } } },
      { principal, request },
    )
    expect(createInviteFor).toHaveBeenCalledWith(principal, 'for Carol', request, 'http://localhost:3000')
  })
})
