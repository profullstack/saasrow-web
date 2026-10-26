import 'server-only'
import { createHash } from 'node:crypto'
import { Credits, supabaseStore as creditsStore, type Grant } from '@profullstack/redeem-credits'
import {
  Affiliates,
  hashCode,
  normalizeCode,
  refFromRequest,
  supabaseStore as affiliatesStore,
} from '@profullstack/affiliates'
import { clientIp } from '@profullstack/x402-gateway'
import { getSupabaseAdmin } from './supabaseAdmin'
import { ApiError } from './publicApi'
import type { ApiPrincipal } from './apiAuth'
import {
  INVITE_BONUS_DAYS,
  INVITE_QUOTA,
  PENDING_INVITE_TTL_MS,
  PREMIUM_DAYS_UNIT,
  bonusVerdict,
  canAcceptInvite,
  canSendInvites,
  inviteReasonMessage,
  inviteUrl,
  looksLikeInviteCode,
  redeemReasonMessage,
} from './inviteRules'

// Credit codes (@profullstack/redeem-credits) and invites
// (@profullstack/affiliates) on saasrow.
//
// Premium is the balance: a code's `premium_days` grant is mirrored by onGrant
// into grant_premium_days(), the same coinpay_orders/user_tokens record a paid
// Premium term uses, so nothing else on the site needs to know about codes.
// Both stores are built lazily from the service-role client (never at module
// load: Next.js would inline a missing runtime env as undefined).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

let credits: Credits | undefined
let affiliates: Affiliates | undefined

export function getCredits(): Credits {
  return (credits ??= new Credits(creditsStore(getSupabaseAdmin() as Db), { onGrant: mirrorGrant }))
}

export function getAffiliates(): Affiliates {
  return (affiliates ??= new Affiliates(affiliatesStore(getSupabaseAdmin() as Db), { defaultQuota: INVITE_QUOTA }))
}

async function emailOf(userId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin().from('users').select('email').eq('id', userId).maybeSingle()
  return (data as { email?: string } | null)?.email ?? null
}

export interface PremiumGrantResult {
  applied: boolean
  lifetime?: boolean
  days?: number
  premium_until?: string
  reason?: string
}

/** Days of Premium for an email, idempotent on `key`. Lifetime stays lifetime. */
export async function grantPremiumDays(email: string, days: number, key: string, note = ''): Promise<PremiumGrantResult> {
  const { data, error } = await getSupabaseAdmin().rpc('grant_premium_days', {
    p_email: email,
    p_days: Math.floor(days),
    p_key: key,
    p_note: note,
  })
  if (error) throw new Error(`grant_premium_days failed: ${error.message}`)
  return data as PremiumGrantResult
}

/** onGrant: every committed premium_days grant becomes Premium on the account. */
export async function mirrorGrant(userId: string, grant: Grant, source: string): Promise<void> {
  if (grant.unit !== PREMIUM_DAYS_UNIT || !(grant.amount >= 1)) return
  const email = await emailOf(userId)
  if (!email) throw new Error(`mirrorGrant: no account ${userId}`)
  await grantPremiumDays(email, grant.amount, `credit:${source}:${userId}`, `credit ${source}`)
}

/**
 * Re-apply every premium_days grant in the ledger. Each mirror is idempotent,
 * so this only fills in a grant whose mirror failed after the code was spent.
 */
export async function reconcileGrants(userId: string): Promise<void> {
  const history = await getCredits().history(userId, PREMIUM_DAYS_UNIT)
  for (const h of history) {
    if (h.kind !== 'grant') continue
    await mirrorGrant(userId, { unit: h.unit, amount: h.amount }, h.source)
  }
}

export interface PremiumStatus {
  premium: boolean
  lifetime: boolean
  premium_until: string | null
}

export async function premiumStatus(email: string): Promise<PremiumStatus> {
  const supabase = getSupabaseAdmin()
  const lower = email.toLowerCase()
  const [{ data: token }, { data: orders }] = await Promise.all([
    supabase.from('user_tokens').select('tier').ilike('email', lower.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle(),
    supabase
      .from('coinpay_orders')
      .select('tier, term, status, period_end')
      .ilike('email', lower.replace(/[\\%_]/g, (c) => `\\${c}`))
      .order('period_end', { ascending: false, nullsFirst: false })
      .limit(50),
  ])
  const rows = (orders ?? []) as Array<{ tier: string; term: string; status: string; period_end: string | null }>
  const now = Date.now()
  const live = rows.find((o) => o.term !== 'once' && o.period_end && Date.parse(o.period_end) > now)
  const tier = (token as { tier?: string } | null)?.tier ?? null
  const lifetime =
    rows.some((o) => o.tier === 'premium' && o.term === 'once' && o.status === 'paid') || (tier === 'premium' && !live)
  return { premium: tier === 'premium', lifetime, premium_until: lifetime ? null : live?.period_end ?? null }
}

// ------------------------------------------------------------ credit codes

export type RedeemOutcome =
  | { ok: true; unit: string; days: number; premium: PremiumStatus }
  | { ok: false; reason: string; message: string }

export async function redeemCreditCode(principal: ApiPrincipal, code: unknown): Promise<RedeemOutcome> {
  if (typeof code !== 'string' || !code.trim() || code.length > 64) {
    throw new ApiError(400, 'A code is required, like CR-XXXX-XXXX-XXXX-XXXX')
  }
  const result = await getCredits().redeem(code, principal.userId)
  if (!result.ok) {
    // A code spent while its mirror failed answers already_redeemed from now
    // on: heal the account so the Premium it paid for is there.
    if (result.reason === 'already_redeemed') await reconcileGrants(principal.userId).catch(() => undefined)
    return { ok: false, reason: result.reason, message: redeemReasonMessage(result.reason) }
  }
  return {
    ok: true,
    unit: result.grant.unit,
    days: result.grant.amount,
    premium: await premiumStatus(principal.email),
  }
}

/** Admin: mint a one-off premium_days code. The plaintext is returned once. */
export async function mintPremiumCode(input: {
  days: unknown
  label?: unknown
  maxRedemptions?: unknown
  expiresInDays?: unknown
  createdBy?: string
}) {
  const days = Number(input.days)
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new ApiError(400, 'days must be a whole number 1..3650')
  const max = input.maxRedemptions == null ? 1 : Number(input.maxRedemptions)
  if (!Number.isInteger(max) || max < 1 || max > 10000) throw new ApiError(400, 'max_redemptions must be 1..10000')
  const expiresDays = input.expiresInDays == null ? null : Number(input.expiresInDays)
  if (expiresDays !== null && (!Number.isFinite(expiresDays) || expiresDays <= 0)) {
    throw new ApiError(400, 'expires_in_days must be positive')
  }
  const label = typeof input.label === 'string' ? input.label.slice(0, 120) : ''
  return getCredits().mint({
    grant: { unit: PREMIUM_DAYS_UNIT, amount: days },
    label,
    maxRedemptions: max,
    expiresAt: expiresDays === null ? null : Date.now() + expiresDays * 86_400_000,
    createdBy: input.createdBy,
  })
}

// ----------------------------------------------------------------- invites

export function ipHash(req: Request): string | null {
  const ip = clientIp(req)
  if (!ip || ip === 'unknown') return null
  return createHash('sha256').update(`saasrow-invite:${ip}`).digest('hex')
}

interface AccountFacts {
  email: string
  createdAt: string | null
  hasApprovedListing: boolean
  oldestListingAt: string | null
  pendingListings: number
}

export async function accountFacts(userId: string): Promise<AccountFacts | null> {
  const supabase = getSupabaseAdmin()
  const { data: user } = await supabase.from('users').select('email, created_at').eq('id', userId).maybeSingle()
  const u = user as { email: string; created_at: string | null } | null
  if (!u) return null

  const ids = new Set<string>()
  const { data: contacts } = await supabase
    .from('submission_contacts')
    .select('submission_id')
    .ilike('email', u.email.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`))
  for (const c of (contacts ?? []) as Array<{ submission_id: string | null }>) if (c.submission_id) ids.add(c.submission_id)
  const { data: owned } = await supabase.from('software_submissions').select('id').eq('user_id', userId)
  for (const s of (owned ?? []) as Array<{ id: string }>) ids.add(s.id)

  let listings: Array<{ status: string; submitted_at: string | null }> = []
  if (ids.size > 0) {
    const { data } = await supabase.from('software_submissions').select('status, submitted_at').in('id', [...ids])
    listings = (data ?? []) as typeof listings
  }
  const times = listings.map((l) => l.submitted_at).filter((t): t is string => !!t).sort()
  return {
    email: u.email,
    createdAt: u.created_at,
    hasApprovedListing: listings.some((l) => l.status === 'approved'),
    oldestListingAt: times[0] ?? null,
    pendingListings: listings.filter((l) => l.status === 'pending').length,
  }
}

type BonusRow = {
  invite_id: string
  inviter_id: string
  inviter_ip_hash: string | null
  invitee_id: string | null
  invitee_ip_hash: string | null
  status: 'open' | 'pending' | 'paid' | 'blocked'
  reason: string | null
  days: number | null
  accepted_at: string | null
  paid_at: string | null
}

export interface InviteView {
  id: string
  note: string
  created_at: string
  expires_at: string | null
  status: 'unused' | 'expired' | 'revoked' | 'accepted'
  bonus: 'paid' | 'pending' | 'withheld' | null
}

export async function inviteOverview(principal: ApiPrincipal, origin: string) {
  const aff = getAffiliates()
  await settlePendingFor(principal.userId).catch((e) => console.error('[invites] settle', e))
  const facts = await accountFacts(principal.userId)
  const [quota, invites, code] = await Promise.all([
    aff.quota(principal.userId),
    aff.invites(principal.userId),
    aff.affiliateCode(principal.userId),
  ])
  const { data: bonusRows } = await getSupabaseAdmin()
    .from('invite_bonuses')
    .select('invite_id, status')
    .eq('inviter_id', principal.userId)
  const bonus = new Map(((bonusRows ?? []) as Array<{ invite_id: string; status: string }>).map((b) => [b.invite_id, b.status]))
  const now = Date.now()
  const send = canSendInvites({
    accountCreatedAt: facts?.createdAt ?? null,
    hasApprovedListing: facts?.hasApprovedListing ?? false,
  })
  return {
    quota,
    can_send: send.ok,
    can_send_reason: send.ok ? null : send.reason,
    bonus_days: INVITE_BONUS_DAYS,
    invites: invites.map(
      (i): InviteView => ({
        id: i.id,
        note: i.note,
        created_at: new Date(i.createdAt).toISOString(),
        expires_at: i.expiresAt ? new Date(i.expiresAt).toISOString() : null,
        status: i.usedBy
          ? 'accepted'
          : (i as { revokedAt?: number | null }).revokedAt
            ? 'revoked'
            : i.expiresAt && i.expiresAt <= now
              ? 'expired'
              : 'unused',
        bonus: i.usedBy
          ? bonus.get(i.id) === 'paid'
            ? 'paid'
            : bonus.get(i.id) === 'blocked'
              ? 'withheld'
              : 'pending'
          : null,
      }),
    ),
    affiliate_link: `${origin}/?ref=${encodeURIComponent(code)}`,
    premium: facts ? await premiumStatus(facts.email) : null,
  }
}

export async function createInviteFor(principal: ApiPrincipal, note: unknown, req: Request, origin: string) {
  const facts = await accountFacts(principal.userId)
  const send = canSendInvites({
    accountCreatedAt: facts?.createdAt ?? null,
    hasApprovedListing: facts?.hasApprovedListing ?? false,
  })
  if (!send.ok) throw new ApiError(403, send.reason)
  let invite
  try {
    invite = await getAffiliates().createInvite(principal.userId, typeof note === 'string' ? note.slice(0, 80) : '')
  } catch (e) {
    if (e instanceof Error && /no invites left/.test(e.message)) {
      throw new ApiError(409, `You have used all ${INVITE_QUOTA} of your invites.`)
    }
    throw e
  }
  const { error } = await getSupabaseAdmin().from('invite_bonuses').insert({
    invite_id: invite.id,
    inviter_id: principal.userId,
    inviter_ip_hash: ipHash(req),
  })
  if (error) console.error('[invites] bonus row', error.message)
  return {
    id: invite.id,
    code: invite.code,
    url: inviteUrl(origin, invite.code),
    expires_at: invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null,
    quota: await getAffiliates().quota(principal.userId),
  }
}

export async function revokeInviteFor(principal: ApiPrincipal, inviteId: string) {
  const aff = getAffiliates()
  const mine = (await aff.invites(principal.userId)).find((i) => i.id === inviteId)
  if (!mine) throw new ApiError(404, 'No such invite')
  if (mine.usedBy) throw new ApiError(409, 'That invite was already accepted')
  await aff.revokeInvite(inviteId)
  return { revoked: true, id: inviteId, quota: await aff.quota(principal.userId) }
}

export interface AcceptOutcome {
  accepted: boolean
  message: string
  bonus?: { paid: boolean; days?: number; reason?: string }
}

/** A signed-in (so email-confirmed) account accepts an invite. */
export async function acceptInvite(user: { userId: string; email: string }, code: unknown, req: Request): Promise<AcceptOutcome> {
  if (!looksLikeInviteCode(code)) return { accepted: false, message: 'That invite code is not valid.' }
  const facts = await accountFacts(user.userId)
  const eligible = canAcceptInvite({
    accountCreatedAt: facts?.createdAt ?? null,
    oldestListingAt: facts?.oldestListingAt ?? null,
  })
  if (!eligible.ok) return { accepted: false, message: eligible.reason }

  const aff = getAffiliates()
  const r = await aff.redeemInvite(code, user.userId)
  if (!r.ok) return { accepted: false, message: inviteReasonMessage(r.reason) }

  const supabase = getSupabaseAdmin()
  const accepted = {
    invitee_id: user.userId,
    invitee_ip_hash: ipHash(req),
    accepted_at: new Date().toISOString(),
    status: 'pending',
  }
  const { data: updated } = await supabase
    .from('invite_bonuses')
    .update(accepted)
    .eq('invite_id', r.inviteId)
    .eq('status', 'open')
    .select('invite_id')
  if (!updated || (updated as unknown[]).length === 0) {
    // Invite minted outside the site (CLI/admin): no row yet.
    await supabase
      .from('invite_bonuses')
      .upsert({ invite_id: r.inviteId, inviter_id: r.inviterId, ...accepted }, { onConflict: 'invite_id', ignoreDuplicates: true })
  }
  const bonus = await settleBonus(r.inviteId)
  return {
    accepted: true,
    message: bonus.paid
      ? `Invite accepted. You and your inviter each get ${INVITE_BONUS_DAYS} days of Premium.`
      : 'Invite accepted. Welcome to SaaSRow.',
    bonus,
  }
}

/** Run the spam guards and pay both sides, once. Never pays a row that is not 'pending'. */
export async function settleBonus(inviteId: string): Promise<{ paid: boolean; days?: number; reason?: string }> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('invite_bonuses').select('*').eq('invite_id', inviteId).maybeSingle()
  const row = data as BonusRow | null
  if (!row) return { paid: false, reason: 'no such invite' }
  if (row.status === 'paid') return { paid: true, days: row.days ?? INVITE_BONUS_DAYS }
  if (row.status !== 'pending' || !row.invitee_id) return { paid: false, reason: row.status }

  const [inviter, invitee] = await Promise.all([accountFacts(row.inviter_id), accountFacts(row.invitee_id)])
  if (!inviter || !invitee) return { paid: false, reason: 'account missing' }
  const verdict = bonusVerdict({
    inviterEmail: inviter.email,
    inviteeEmail: invitee.email,
    inviterIpHash: row.inviter_ip_hash,
    inviteeIpHash: row.invitee_ip_hash,
    inviteePendingListings: invitee.pendingListings,
  })
  if (!verdict.ok) {
    await supabase
      .from('invite_bonuses')
      .update({ status: 'blocked', reason: verdict.reason })
      .eq('invite_id', inviteId)
      .eq('status', 'pending')
    console.warn(`[invites] bonus withheld invite=${inviteId} reason=${verdict.reason}`)
    return { paid: false, reason: 'withheld' }
  }
  const { data: settled, error } = await supabase.rpc('settle_invite_bonus', {
    p_invite: inviteId,
    p_days: INVITE_BONUS_DAYS,
  })
  if (error) throw new Error(`settle_invite_bonus failed: ${error.message}`)
  const s = settled as { paid: boolean; reason?: string; days?: number }
  return s.paid ? { paid: true, days: s.days } : { paid: s.reason === 'already paid', reason: s.reason }
}

/** Settle any accepted invite on either side that has not paid yet (a retry after an error). */
export async function settlePendingFor(userId: string): Promise<void> {
  const { data } = await getSupabaseAdmin()
    .from('invite_bonuses')
    .select('invite_id')
    .eq('status', 'pending')
    .or(`inviter_id.eq.${userId},invitee_id.eq.${userId}`)
  for (const r of (data ?? []) as Array<{ invite_id: string }>) await settleBonus(r.invite_id)
}

/** Landing page: is this invite usable, and whose is it (display name only, never an email)? */
export async function peekInvite(code: string): Promise<{ valid: boolean; reason?: string; inviter?: string }> {
  if (!looksLikeInviteCode(code)) return { valid: false, reason: inviteReasonMessage('invalid') }
  const { data, error } = await getSupabaseAdmin().rpc('aff_get_invite_by_hash', { p_hash: hashCode(normalizeCode(code)) })
  if (error) throw new Error(`aff_get_invite_by_hash failed: ${error.message}`)
  const row = (Array.isArray(data) ? data[0] : data) as
    | { inviter_id: string; expires_at: number | string | null; used_by: string | null; revoked_at: number | string | null }
    | undefined
  if (!row) return { valid: false, reason: inviteReasonMessage('invalid') }
  if (row.revoked_at) return { valid: false, reason: inviteReasonMessage('revoked') }
  if (row.used_by) return { valid: false, reason: inviteReasonMessage('used') }
  if (row.expires_at && Number(row.expires_at) <= Date.now()) return { valid: false, reason: inviteReasonMessage('expired') }
  const { data: inviter } = await getSupabaseAdmin().from('users').select('display_name').eq('id', row.inviter_id).maybeSingle()
  return { valid: true, inviter: (inviter as { display_name?: string | null } | null)?.display_name || 'A SaaSRow member' }
}

/** Keep an invite with an emailed sign-in, so the code counts even if it is typed in another browser. */
export async function savePendingInvite(email: string, code: unknown): Promise<void> {
  if (!looksLikeInviteCode(code)) return
  await getSupabaseAdmin()
    .from('invite_pending')
    .upsert({ email: email.toLowerCase(), code: normalizeCode(code), created_at: new Date().toISOString() })
}

async function takePendingInvite(email: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('invite_pending').select('code, created_at').eq('email', email.toLowerCase()).maybeSingle()
  const row = data as { code: string; created_at: string } | null
  if (!row) return null
  await supabase.from('invite_pending').delete().eq('email', email.toLowerCase())
  return Date.now() - Date.parse(row.created_at) <= PENDING_INVITE_TTL_MS ? row.code : null
}

/**
 * After an emailed code is verified (the account is confirmed): accept the
 * invite carried by the request or saved with the sign-in, and record
 * first-touch affiliate attribution for a new account. Never throws: sign-in
 * must not fail because of an invite.
 */
export async function afterSignIn(req: Request, user: { id: string; email: string }, bodyInvite?: unknown): Promise<AcceptOutcome | null> {
  let outcome: AcceptOutcome | null = null
  try {
    const pending = await takePendingInvite(user.email)
    const code = looksLikeInviteCode(bodyInvite) ? bodyInvite : pending
    if (code) outcome = await acceptInvite({ userId: user.id, email: user.email }, code, req)
  } catch (e) {
    console.error('[invites] accept on sign-in', e)
  }
  try {
    const ref = refFromRequest(req)
    if (ref) {
      const facts = await accountFacts(user.id)
      const fresh = canAcceptInvite({ accountCreatedAt: facts?.createdAt ?? null, oldestListingAt: facts?.oldestListingAt ?? null })
      // `external` codes belong to the @profullstack/referrals program, which
      // applies them at checkout; nothing is recorded here for those.
      if (fresh.ok) await getAffiliates().attribute(ref, user.id)
    }
  } catch (e) {
    console.error('[invites] attribution', e)
  }
  return outcome
}
