import { describe, it, expect, vi } from 'vitest'
import {
  buildSessionRequest,
  hmacHex,
  readEvent,
  settlePaidEvent,
  verifySignature,
} from '../../supabase/functions/_shared/coinpay'

type Row = Record<string, any>

// Just enough of the supabase-js builder for coinpay.ts + managementAccess.ts.
function fakeDb(tables: Record<string, Row[]>) {
  let seq = 0
  return {
    tables,
    from(table: string) {
      const rows = (tables[table] ??= [])
      const filters: ((r: Row) => boolean)[] = []
      let op: 'select' | 'update' | 'insert' | 'delete' = 'select'
      let patch: Row = {}
      let inserted: Row | null = null
      let insertError: Row | null = null
      let order: { col: string; asc: boolean } | null = null
      let limit = Infinity
      const run = () => {
        if (op === 'insert') return { data: inserted, error: insertError }
        const hit = rows.filter((r) => filters.every((f) => f(r)))
        if (op === 'update') {
          hit.forEach((r) => Object.assign(r, patch))
          return { data: hit, error: null }
        }
        if (op === 'delete') {
          for (const r of hit) rows.splice(rows.indexOf(r), 1)
          return { data: hit, error: null }
        }
        let out = [...hit]
        if (order) {
          const { col, asc } = order
          out.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1))
        }
        return { data: out.slice(0, limit), error: null }
      }
      const q: any = {
        select: () => q,
        insert: (row: Row) => {
          op = 'insert'
          if (table === 'coinpay_orders' && rows.some((r) => r.checkout_session_id === row.checkout_session_id)) {
            insertError = { code: '23505', message: 'duplicate key' }
          } else {
            inserted = { id: ++seq, ...row }
            rows.push(inserted)
          }
          return q
        },
        update: (p: Row) => ((op = 'update'), (patch = p), q),
        delete: () => ((op = 'delete'), q),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
        gt: (c: string, v: string) => (filters.push((r) => r[c] != null && r[c] > v), q),
        ilike: (c: string, p: string) =>
          (filters.push((r) => typeof r[c] === 'string' && r[c].toLowerCase() === p.replace(/\\/g, '').toLowerCase()), q),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
        order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), q),
        limit: (n: number) => ((limit = n), q),
        maybeSingle: () => {
          const r = run()
          return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error })
        },
        then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      }
      return q
    },
  }
}

const SECRET = 'whsecret_test'
const BUYER = 'riotcoder+saasrow-cs-test@profullstack.com'

function event(type: string, data: Row = {}) {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    business_id: 'f8d5f143-70e7-48ca-8d15-2107fbdc0846',
    data: {
      payment_id: 'pay_1',
      status: 'confirmed',
      amount: 5,
      amount_usd: 5,
      checkout_session_id: 'cs_test_1',
      customer_email: BUYER,
      account_id: BUYER,
      property: 'saasrow.com',
      metadata: { tier: 'premium', term: 'month', interval: 'month' },
      ...data,
    },
  }
}

function db() {
  return fakeDb({
    user_tokens: [],
    coinpay_orders: [],
    submission_contacts: [{ submission_id: 's1', email: BUYER }],
    users: [],
    software_submissions: [{ id: 's1', tier: 'free' }, { id: 's2', tier: 'free' }],
  })
}

describe('buildSessionRequest', () => {
  const base = {
    tier: 'premium',
    mode: 'subscription',
    interval: 'month',
    customer_email: ' Riotcoder+saasrow-cs-test@profullstack.com ',
    success_url: 'https://saasrow.com/featured?success=true&session={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://saasrow.com/featured?cancelled=true',
  }

  it('prices on the server and sends the CoinPay contract fields', () => {
    const r = buildSessionRequest({ ...base, amount: 1, datafast_visitor_id: 'v1', submission_id: 'sub-9' }, {})
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.body).toMatchObject({
      amount: 5,
      currency: 'USD',
      customer_email: 'riotcoder+saasrow-cs-test@profullstack.com',
      account_id: 'riotcoder+saasrow-cs-test@profullstack.com',
      property: 'saasrow.com',
      expires_in_minutes: 60,
      metadata: { tier: 'premium', term: 'month', interval: 'month', term_days: '30', datafast_visitor_id: 'v1', submission_id: 'sub-9' },
    })
    expect(r.body.success_url).toContain('{CHECKOUT_SESSION_ID}')
  })

  it('bills a signed-in user to their user id', () => {
    const r = buildSessionRequest(base, { accountId: 'user-123' })
    expect(r.ok && r.body.account_id).toBe('user-123')
  })

  it('sells Featured and Premium lifetime as one-time, and halves for 50OFF', () => {
    const f = buildSessionRequest({ ...base, tier: 'featured', mode: 'payment', interval: undefined }, {})
    expect(f.ok && f.body.amount).toBe(2)
    expect(f.ok && f.term).toBe('once')
    const l = buildSessionRequest({ ...base, mode: 'payment', interval: undefined, discount_code: '50OFF' }, {})
    expect(l.ok && l.body.amount).toBe(99.5)
  })

  it('refuses unknown tiers, bad emails and off-site redirects', () => {
    expect(buildSessionRequest({ ...base, tier: 'gold' }, {}).ok).toBe(false)
    expect(buildSessionRequest({ ...base, customer_email: 'nope' }, {}).ok).toBe(false)
    expect(buildSessionRequest({ ...base, success_url: 'https://evil.example/x' }, {}).ok).toBe(false)
  })
})

describe('verifySignature', () => {
  const raw = JSON.stringify(event('payment.confirmed'))
  const now = 1_800_000_000

  it('accepts t=,v1= over the raw body', async () => {
    const sig = await hmacHex(SECRET, `${now}.${raw}`)
    expect(await verifySignature(raw, `t=${now},v1=${sig}`, SECRET, now)).toBe(true)
  })

  it('rejects a bad signature, a re-serialised body and a stale timestamp', async () => {
    const sig = await hmacHex(SECRET, `${now}.${raw}`)
    expect(await verifySignature(raw, `t=${now},v1=${'0'.repeat(64)}`, SECRET, now)).toBe(false)
    expect(await verifySignature(raw + ' ', `t=${now},v1=${sig}`, SECRET, now)).toBe(false)
    expect(await verifySignature(raw, `t=${now},v1=${sig}`, SECRET, now + 301)).toBe(false)
    expect(await verifySignature(raw, null, SECRET, now)).toBe(false)
  })
})

describe('readEvent', () => {
  it('reads the nested body; confirmed and forwarded are paid, expired is not', () => {
    const e = readEvent(event('payment.confirmed'))
    expect(e).toMatchObject({ paid: true, checkoutSessionId: 'cs_test_1', paymentId: 'pay_1', email: BUYER, amountUsd: 5 })
    expect(readEvent(event('payment.forwarded')).paid).toBe(true)
    expect(readEvent(event('payment.expired')).paid).toBe(false)
  })
})

describe('settlePaidEvent', () => {
  const now = () => new Date('2026-10-21T12:00:00Z')

  it('grants a Premium month: token, listings, order with a 30-day term, link + admin note', async () => {
    const d = db()
    const sendManagementLink = vi.fn(async () => {})
    const notifyAdmin = vi.fn(async () => {})
    const r = await settlePaidEvent(d, readEvent(event('payment.confirmed')), { now, sendManagementLink, notifyAdmin })
    expect(r).toMatchObject({ applied: true, tier: 'premium', term: 'month', periodEnd: '2026-11-20T12:00:00.000Z' })
    expect(d.tables.user_tokens).toMatchObject([{ email: BUYER, tier: 'premium' }])
    expect(d.tables.software_submissions.find((s) => s.id === 's1')!.tier).toBe('premium')
    expect(d.tables.software_submissions.find((s) => s.id === 's2')!.tier).toBe('free')
    expect(d.tables.coinpay_orders[0]).toMatchObject({ checkout_session_id: 'cs_test_1', amount_cents: 500, term: 'month', prior_tier: null })
    expect(sendManagementLink).toHaveBeenCalledWith(BUYER)
    expect(notifyAdmin).toHaveBeenCalledWith(BUYER, 'premium')
  })

  it('is idempotent: forwarded after confirmed for the same session grants once', async () => {
    const d = db()
    const notifyAdmin = vi.fn(async () => {})
    await settlePaidEvent(d, readEvent(event('payment.confirmed')), { now, notifyAdmin })
    const again = await settlePaidEvent(d, readEvent(event('payment.forwarded')), { now, notifyAdmin })
    expect(again).toEqual({ applied: false, reason: 'already settled' })
    expect(d.tables.coinpay_orders).toHaveLength(1)
    expect(notifyAdmin).toHaveBeenCalledTimes(1)
  })

  it('settles a forwarded event alone (confirmed delivery failed)', async () => {
    const d = db()
    const r = await settlePaidEvent(d, readEvent(event('payment.forwarded')), { now })
    expect(r.applied).toBe(true)
  })

  it('settles a PayPal capture (payment.confirmed, status completed, rail paypal)', async () => {
    const d = db()
    const ev = readEvent(event('payment.confirmed', {
      status: 'completed',
      rail: 'paypal',
      checkout_session_id: 'cs_pp',
      metadata: { tier: 'featured', term: 'once' },
      amount_usd: 2,
    }))
    const r = await settlePaidEvent(d, ev, { now })
    expect(r).toMatchObject({ applied: true, tier: 'featured', term: 'once', periodEnd: null })
    expect(d.tables.coinpay_orders[0]).toMatchObject({ method: 'paypal', amount_cents: 200, period_end: null })
    expect(d.tables.user_tokens[0].tier).toBe('featured')
  })

  it('grants nothing for a non-paid status', async () => {
    const d = db()
    const r = await settlePaidEvent(d, readEvent(event('payment.expired', { status: 'expired' })), { now })
    expect(r.applied).toBe(false)
    expect(d.tables.user_tokens).toHaveLength(0)
    expect(d.tables.coinpay_orders).toHaveLength(0)
  })

  it('extends a live term from its end and keeps the prior tier', async () => {
    const d = db()
    d.tables.user_tokens.push({ email: BUYER, tier: 'featured' })
    await settlePaidEvent(d, readEvent(event('payment.confirmed')), { now })
    const second = await settlePaidEvent(d, readEvent(event('payment.confirmed', { checkout_session_id: 'cs_test_2', metadata: { tier: 'premium', term: 'year' } })), { now })
    expect(second).toMatchObject({ applied: true, periodEnd: '2027-11-20T12:00:00.000Z' })
    expect(d.tables.coinpay_orders.map((o) => o.prior_tier)).toEqual(['featured', 'featured'])
  })

  it('does not downgrade a Premium buyer who also buys Featured', async () => {
    const d = db()
    d.tables.user_tokens.push({ email: BUYER, tier: 'premium' })
    const notifyAdmin = vi.fn(async () => {})
    await settlePaidEvent(d, readEvent(event('payment.confirmed', { metadata: { tier: 'featured', term: 'once' } })), { now, notifyAdmin })
    expect(d.tables.user_tokens[0].tier).toBe('premium')
    expect(notifyAdmin).not.toHaveBeenCalled()
  })

  it('ignores another property and events with no tier', async () => {
    const d = db()
    expect((await settlePaidEvent(d, readEvent(event('payment.confirmed', { property: 'other.site' })), { now })).applied).toBe(false)
    expect((await settlePaidEvent(d, readEvent(event('payment.confirmed', { metadata: {} })), { now })).applied).toBe(false)
  })
})
