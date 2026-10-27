import { describe, it, expect, vi, beforeEach } from 'vitest'

// A tiny fake of the supabase-js surface credits.ts uses: from(table) chains
// that resolve to rows from `tables`, and rpc() recorded for assertions.
type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
const rpc = vi.fn()
const updates: Array<{ table: string; values: Row; filters: Array<[string, unknown]> }> = []

function query(table: string) {
  const filters: Array<[string, unknown]> = []
  let pendingUpdate: Row | null = null
  const rows = () =>
    (tables[table] ?? []).filter((r) =>
      filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : String(r[k]).toLowerCase() === String(v).toLowerCase())),
    )
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (k: string, v: unknown) => (filters.push([k, v]), chain),
    ilike: (k: string, v: string) => (filters.push([k, v.replace(/\\(.)/g, '$1')]), chain),
    in: (k: string, v: unknown[]) => (filters.push([k, v]), chain),
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    update: (values: Row) => ((pendingUpdate = values), chain),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => void) => {
      if (pendingUpdate) {
        updates.push({ table, values: pendingUpdate, filters: [...filters] })
        for (const r of rows()) Object.assign(r, pendingUpdate)
        return resolve({ data: rows(), error: null })
      }
      return resolve({ data: rows(), error: null })
    },
  }
  return chain
}

vi.mock('@/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: () => ({ from: (t: string) => query(t), rpc: (...a: unknown[]) => rpc(...a) }),
}))

const { mirrorGrant, settleBonus, peekInvite, acceptInvite } = await import('@/lib/credits')

const day = 86_400_000
beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  updates.length = 0
  rpc.mockReset()
  tables.users = [
    { id: 'u-alice', email: 'alice@example.com', created_at: new Date(Date.now() - 30 * day).toISOString(), display_name: null },
    { id: 'u-carol', email: 'carol@example.org', created_at: new Date().toISOString(), display_name: null },
  ]
  tables.submission_contacts = []
  tables.software_submissions = []
})

describe('mirrorGrant (onGrant)', () => {
  it('turns a premium_days grant into Premium, keyed per code and user', async () => {
    rpc.mockResolvedValue({ data: { applied: true }, error: null })
    await mirrorGrant('u-carol', { unit: 'premium_days', amount: 30 }, 'code:crd_1')
    expect(rpc).toHaveBeenCalledWith('grant_premium_days', {
      p_email: 'carol@example.org',
      p_days: 30,
      p_key: 'credit:code:crd_1:u-carol',
      p_note: 'credit code:crd_1',
    })
  })
  it('ignores other units', async () => {
    await mirrorGrant('u-carol', { unit: 'minutes', amount: 30 }, 'code:x')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('settleBonus', () => {
  const pending = (extra: Row = {}) => ({
    invite_id: 'inv1',
    inviter_id: 'u-alice',
    inviter_ip_hash: 'aaa',
    invitee_id: 'u-carol',
    invitee_ip_hash: 'bbb',
    status: 'pending',
    ...extra,
  })

  it('pays both sides through the settle function', async () => {
    tables.invite_bonuses = [pending()]
    rpc.mockResolvedValue({ data: { paid: true, days: 7 }, error: null })
    expect(await settleBonus('inv1')).toEqual({ paid: true, days: 7 })
    expect(rpc).toHaveBeenCalledWith('settle_invite_bonus', { p_invite: 'inv1', p_days: 7 })
  })

  it('withholds the bonus when a spam guard trips, and never calls the payer', async () => {
    tables.invite_bonuses = [pending({ invitee_ip_hash: 'aaa' })]
    expect(await settleBonus('inv1')).toEqual({ paid: false, reason: 'withheld' })
    expect(rpc).not.toHaveBeenCalled()
    expect(tables.invite_bonuses[0].status).toBe('blocked')
  })

  it('does nothing for a row already paid or never accepted', async () => {
    tables.invite_bonuses = [pending({ status: 'paid', days: 7 })]
    expect((await settleBonus('inv1')).paid).toBe(true)
    tables.invite_bonuses = [pending({ status: 'open', invitee_id: null })]
    expect((await settleBonus('inv1')).paid).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('acceptInvite', () => {
  it('refuses an established account before touching the invite', async () => {
    const req = new Request('https://saasrow.com/api/v1/me/invites/accept')
    const r = await acceptInvite({ userId: 'u-alice', email: 'alice@example.com' }, 'INV-AAAA-BBBB-CCCC', req)
    expect(r.accepted).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('refuses a second invite for an account that already joined on one', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'aff_invited_by' ? { data: 'u-alice', error: null } : { data: null, error: null },
    )
    const req = new Request('https://saasrow.com/api/v1/me/invites/accept')
    const r = await acceptInvite({ userId: 'u-carol', email: 'carol@example.org' }, 'INV-AAAA-BBBB-CCCC', req)
    expect(r).toEqual({ accepted: false, message: 'You have already joined on an invite.' })
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain('aff_claim_invite')
  })
  it('a concurrent accept that loses the claim is already_invited: no bonus row, invite left unused', async () => {
    // invitedBy saw nothing yet (the other accept is in flight); the claim then
    // loses to the unique index and the invite reads back still unused.
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'aff_get_invite_by_hash' || fn === 'aff_get_invite')
        return { data: [{ id: 'inv2', code_hash: 'h', inviter_id: 'u-alice', created_at: Date.now() - day, expires_at: null, used_by: null, used_at: null, note: '', revoked_at: null }], error: null }
      if (fn === 'aff_claim_invite') return { data: false, error: null }
      return { data: null, error: null }
    })
    tables.invite_bonuses = []
    const req = new Request('https://saasrow.com/api/v1/me/invites/accept')
    const r = await acceptInvite({ userId: 'u-carol', email: 'carol@example.org' }, 'INV-AAAA-BBBB-CCCC', req)
    expect(r).toEqual({ accepted: false, message: 'You have already joined on an invite.' })
    expect(rpc.mock.calls.map((c) => c[0])).toContain('aff_claim_invite')
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain('settle_invite_bonus')
  })
  it('refuses something that is not an invite code', async () => {
    const req = new Request('https://saasrow.com/')
    expect((await acceptInvite({ userId: 'u-carol', email: 'c' }, 'CR-AAAA-BBBB-CCCC-DDDD', req)).accepted).toBe(false)
  })
})

describe('peekInvite', () => {
  it('shows a display name, never an email', async () => {
    rpc.mockResolvedValue({ data: [{ inviter_id: 'u-alice', expires_at: Date.now() + day, used_by: null, revoked_at: null }], error: null })
    const r = await peekInvite('INV-AAAA-BBBB-CCCC')
    expect(r).toEqual({ valid: true, inviter: 'A SaaSRow member' })
    expect(JSON.stringify(r)).not.toContain('@')
  })
  it('reports a used invite', async () => {
    rpc.mockResolvedValue({ data: [{ inviter_id: 'u-alice', expires_at: null, used_by: 'u-x', revoked_at: null }], error: null })
    expect((await peekInvite('INV-AAAA-BBBB-CCCC')).valid).toBe(false)
  })
})
