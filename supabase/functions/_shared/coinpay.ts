// CoinPay hosted checkout for listing tiers: build the session, verify and
// read the webhook, and apply what a paid session buys.
//
// Kept free of Deno/npm imports so vitest can exercise it with a fake client
// (same rule as managementAccess.ts). WebCrypto is global in Deno and Node.

import { resolveTierPrice } from './tierPrices.ts'
import { listingIdsForEmail, normalizeEmail } from './managementAccess.ts'

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any }

export const PROPERTY = 'saasrow.com'
export const TERM_DAYS: Record<'month' | 'year', number> = { month: 30, year: 365 }
const TIER_LEVELS: Record<string, number> = { free: 0, featured: 1, premium: 2 }

export type CheckoutInput = {
  tier?: unknown
  interval?: unknown
  mode?: unknown
  amount?: unknown
  discount_code?: unknown
  customer_email?: unknown
  submission_id?: unknown
  datafast_visitor_id?: unknown
  datafast_session_id?: unknown
  success_url?: unknown
  cancel_url?: unknown
}

export type SessionRequest = {
  amount: number
  currency: 'USD'
  description: string
  customer_email: string
  account_id: string
  property: string
  metadata: Record<string, string>
  success_url: string
  cancel_url: string
  expires_in_minutes: number
}

const ALLOWED_REDIRECT_HOSTS = new Set(['saasrow.com', 'www.saasrow.com', 'localhost'])

function safeRedirect(raw: unknown, siteUrl: string): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const u = new URL(raw)
    const site = new URL(siteUrl)
    if (u.host === site.host || ALLOWED_REDIRECT_HOSTS.has(u.hostname)) return raw
  } catch { /* fall through */ }
  return null
}

const str = (v: unknown, max = 200) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

/**
 * The CoinPay session body for a tier purchase, or why it cannot be sold.
 * The server prices the tier (tierPrices.ts); the browser's amount only
 * counts for a tier with no listed price, which today is none, so unknown
 * tiers are refused.
 */
export function buildSessionRequest(
  input: CheckoutInput,
  opts: { accountId?: string | null; siteUrl?: string },
): { ok: true; body: SessionRequest; term: 'once' | 'month' | 'year'; tier: string } | { ok: false; error: string } {
  const tier = String(input.tier ?? '').toLowerCase()
  const priced = resolveTierPrice(tier, input.interval, input.mode, input.amount)
  if (!priced.ok) return { ok: false, error: priced.error }
  if (!priced.listed || !priced.amount) return { ok: false, error: `Unknown tier ${tier || '(none)'}` }

  const email = normalizeEmail(input.customer_email)
  if (!email) return { ok: false, error: 'A valid customer_email is required' }

  const siteUrl = opts.siteUrl || `https://${PROPERTY}`
  const success = safeRedirect(input.success_url, siteUrl)
  const cancel = safeRedirect(input.cancel_url, siteUrl)
  if (!success || !cancel) return { ok: false, error: 'success_url and cancel_url must be saasrow.com URLs' }

  // The newsletter's 50OFF code halves the price, as the old checkout's
  // promotion code did.
  const discounted = input.discount_code === '50OFF'
  const cents = discounted ? Math.round(priced.amount / 2) : priced.amount
  const term = priced.recurring ?? 'once'

  const metadata: Record<string, string> = {
    tier,
    term,
    billing: term === 'once' ? 'one_time' : 'fixed_term',
  }
  if (term !== 'once') {
    metadata.interval = term
    metadata.term_days = String(TERM_DAYS[term])
  }
  if (discounted) metadata.discount_code = '50OFF'
  const submissionId = str(input.submission_id, 64)
  if (submissionId) metadata.submission_id = submissionId
  const visitor = str(input.datafast_visitor_id)
  if (visitor) metadata.datafast_visitor_id = visitor
  const dsession = str(input.datafast_session_id)
  if (dsession) metadata.datafast_session_id = dsession

  const label = tier === 'premium'
    ? `SaaSRow Premium (${term === 'once' ? 'Lifetime' : term === 'month' ? '30 days' : '365 days'})`
    : 'SaaSRow Featured Listing'

  return {
    ok: true,
    tier,
    term,
    body: {
      amount: cents / 100,
      currency: 'USD',
      description: label,
      customer_email: email,
      account_id: opts.accountId || email,
      property: PROPERTY,
      metadata,
      success_url: success,
      cancel_url: cancel,
      expires_in_minutes: 60,
    },
  }
}

// ---------------------------------------------------------------- webhook

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

/** `X-CoinPay-Signature: t=<unix>,v1=<hex>` = HMAC-SHA256(secret, `${t}.${rawBody}`), 300 s tolerance. */
export async function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false
  const parts: Record<string, string[]> = {}
  for (const piece of header.split(',')) {
    const i = piece.indexOf('=')
    if (i < 1) continue
    const k = piece.slice(0, i).trim()
    ;(parts[k] ??= []).push(piece.slice(i + 1).trim())
  }
  const t = Number(parts.t?.[0])
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > toleranceSec) return false
  const expected = await hmacHex(secret, `${t}.${rawBody}`)
  return (parts.v1 ?? []).some((sig) => safeEqual(sig.toLowerCase(), expected))
}

export type CoinPayEvent = {
  eventId: string | null
  type: string
  paid: boolean
  paymentId: string | null
  checkoutSessionId: string | null
  status: string | null
  amountUsd: number | null
  method: string | null
  email: string | null
  accountId: string | null
  property: string | null
  metadata: Record<string, string>
}

/** Normalise the nested `{id, type, data:{...}}` body. Paid = confirmed or forwarded. */
export function readEvent(payload: unknown): CoinPayEvent {
  // deno-lint-ignore no-explicit-any
  const p = (payload ?? {}) as any
  const d = p.data ?? {}
  const type = String(p.type ?? '')
  const amount = Number(d.amount_usd ?? d.amount)
  return {
    eventId: p.id ?? null,
    type,
    paid: type === 'payment.confirmed' || type === 'payment.forwarded',
    paymentId: d.payment_id ?? d.id ?? null,
    checkoutSessionId: d.checkout_session_id ?? d.metadata?.checkout_session_id ?? null,
    status: d.status ?? null,
    amountUsd: Number.isFinite(amount) ? amount : null,
    method: d.rail ?? d.paid_method ?? d.blockchain ?? d.currency ?? null,
    email: normalizeEmail(d.customer_email ?? d.metadata?.customer_email),
    accountId: d.account_id ?? null,
    property: d.property ?? null,
    metadata: (d.metadata && typeof d.metadata === 'object') ? d.metadata : {},
  }
}

// ------------------------------------------------------------- settlement

export type SettleDeps = {
  now?: () => Date
  sendManagementLink?: (email: string) => Promise<void>
  notifyAdmin?: (email: string, tier: string) => Promise<void>
}

export type SettleResult =
  | { applied: true; tier: string; term: string; periodEnd: string | null }
  | { applied: false; reason: string }

/**
 * Apply what a paid session buys: the order row, the tier on user_tokens and
 * on every listing tied to the email, the management link for a new buyer and
 * the admin notification. The order row's unique session id makes a second
 * event for the same session (confirmed then forwarded) a no-op.
 */
export async function settlePaidEvent(db: Db, ev: CoinPayEvent, deps: SettleDeps = {}): Promise<SettleResult> {
  if (!ev.paid) return { applied: false, reason: `not a paid event (${ev.type})` }
  if (ev.property && ev.property !== PROPERTY) return { applied: false, reason: `other property ${ev.property}` }
  const tier = String(ev.metadata.tier ?? '').toLowerCase()
  if (tier !== 'featured' && tier !== 'premium') return { applied: false, reason: 'no tier in metadata' }
  const termRaw = String(ev.metadata.term ?? ev.metadata.interval ?? 'once')
  const term = termRaw === 'month' || termRaw === 'year' ? termRaw : 'once'
  const email = ev.email
  if (!email) return { applied: false, reason: 'no customer email' }
  const key = ev.checkoutSessionId || ev.paymentId
  if (!key) return { applied: false, reason: 'no session or payment id' }

  const now = deps.now?.() ?? new Date()

  const { data: seen } = await db.from('coinpay_orders').select('id').eq('checkout_session_id', key).maybeSingle()
  if (seen) return { applied: false, reason: 'already settled' }

  const { data: token } = await db.from('user_tokens').select('token, tier').eq('email', email).maybeSingle()

  // Term maths: a payment during a live term extends from its end.
  let periodStart: Date | null = null
  let periodEnd: Date | null = null
  let priorTier: string | null = token?.tier ?? null
  if (term !== 'once') {
    const { data: live } = await db
      .from('coinpay_orders')
      .select('period_end, prior_tier')
      .eq('email', email)
      .neq('term', 'once')
      .gt('period_end', now.toISOString())
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle()
    periodStart = live?.period_end ? new Date(live.period_end) : now
    if (live) priorTier = live.prior_tier ?? null
    periodEnd = new Date(periodStart.getTime() + TERM_DAYS[term] * 86400_000)
  }

  const { error: insertError } = await db.from('coinpay_orders').insert({
    checkout_session_id: key,
    payment_id: ev.paymentId,
    event_id: ev.eventId,
    email,
    account_id: ev.accountId,
    tier,
    term,
    amount_cents: ev.amountUsd != null ? Math.round(ev.amountUsd * 100) : 0,
    currency: 'usd',
    method: ev.method,
    status: 'paid',
    submission_id: ev.metadata.submission_id ?? null,
    prior_tier: term === 'once' ? null : priorTier,
    period_start: periodStart?.toISOString() ?? null,
    period_end: periodEnd?.toISOString() ?? null,
    metadata: ev.metadata,
  })
  if (insertError) {
    // 23505 = a concurrent event for the same session won the race.
    if (insertError.code === '23505') return { applied: false, reason: 'already settled' }
    throw new Error(`coinpay_orders insert failed: ${insertError.message}`)
  }

  try {
    let changed = false
    if (!token) {
      const { error } = await db.from('user_tokens').insert({ email, tier }).select().maybeSingle()
      if (error) throw new Error(`user_tokens insert failed: ${error.message}`)
      changed = true
      await deps.sendManagementLink?.(email)
    } else if ((TIER_LEVELS[tier] ?? 0) > (TIER_LEVELS[token.tier] ?? 0)) {
      const { error } = await db.from('user_tokens').update({ tier }).eq('email', email)
      if (error) throw new Error(`user_tokens update failed: ${error.message}`)
      changed = true
    }

    if (changed) {
      const ids = await listingIdsForEmail(db, email)
      if (ids.length > 0) {
        const { error } = await db.from('software_submissions').update({ tier }).in('id', ids)
        if (error) throw new Error(`software_submissions update failed: ${error.message}`)
      }
      await deps.notifyAdmin?.(email, tier)
    }
  } catch (err) {
    // Let CoinPay's retry (or the forwarded event) try again from scratch.
    await db.from('coinpay_orders').delete().eq('checkout_session_id', key)
    throw err
  }

  return { applied: true, tier, term, periodEnd: periodEnd?.toISOString() ?? null }
}
