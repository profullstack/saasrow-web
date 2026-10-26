// Pure rules for credit codes and invites: no database, no Next.js, so vitest
// can pin every one. The server pieces live in src/lib/credits.ts.

/** A credit code's unit: days of Premium. */
export const PREMIUM_DAYS_UNIT = 'premium_days'
/** Invites each account may send (scarce on purpose). */
export const INVITE_QUOTA = 3
/** Premium days each side gets once an accepted invite clears the checks. */
export const INVITE_BONUS_DAYS = 7
/** An account can send invites once it is this old, or has an approved listing. */
export const INVITER_MIN_AGE_DAYS = 7
/** Only a new account can accept an invite: no farming with established accounts. */
export const INVITEE_MAX_AGE_DAYS = 7
/** An invite code saved with an emailed sign-in counts for this long. */
export const PENDING_INVITE_TTL_MS = 24 * 60 * 60 * 1000
/** A new account with more listings than this in review looks like a submission campaign. */
export const INVITEE_MAX_PENDING_LISTINGS = 3

const DAY = 24 * 60 * 60 * 1000

export type Verdict = { ok: true } | { ok: false; reason: string }

function ageDays(iso: string | null | undefined, now: number): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? (now - t) / DAY : 0
}

export function canSendInvites(
  input: { accountCreatedAt: string | null; hasApprovedListing: boolean },
  now = Date.now(),
): Verdict {
  if (input.hasApprovedListing) return { ok: true }
  if (ageDays(input.accountCreatedAt, now) >= INVITER_MIN_AGE_DAYS) return { ok: true }
  return {
    ok: false,
    reason: `Invites open up once your account is ${INVITER_MIN_AGE_DAYS} days old or one of your listings is approved.`,
  }
}

/**
 * A person may accept an invite only on a new account: the users row is at
 * most a week old and nothing they listed is older than that either (an old
 * listing owner gets a fresh users row the first time they sign in).
 */
export function canAcceptInvite(
  input: { accountCreatedAt: string | null; oldestListingAt: string | null },
  now = Date.now(),
): Verdict {
  if (ageDays(input.accountCreatedAt, now) > INVITEE_MAX_AGE_DAYS) {
    return { ok: false, reason: 'Invites are for new accounts. This account is already a member.' }
  }
  if (input.oldestListingAt && ageDays(input.oldestListingAt, now) > INVITEE_MAX_AGE_DAYS) {
    return { ok: false, reason: 'Invites are for new accounts. This email already has listings here.' }
  }
  return { ok: true }
}

// Throwaway inboxes: the cheap way to farm a bonus. Not exhaustive; it only
// has to make farming cost more than the bonus is worth.
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', '20minutemail.com', 'anonaddy.me', 'burnermail.io', 'dispostable.com',
  'dropmail.me', 'emailondeck.com', 'fakeinbox.com', 'getairmail.com', 'getnada.com',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamailblock.com', 'inboxkitten.com',
  'mail.tm', 'mailcatch.com', 'maildrop.cc', 'mailinator.com', 'mailnesia.com', 'mailpoof.com',
  'mintemail.com', 'moakt.com', 'mohmal.com', 'mytemp.email', 'nada.email', 'sharklasers.com',
  'spam4.me', 'spamgourmet.com', 'temp-mail.io', 'temp-mail.org', 'tempail.com', 'tempmail.com',
  'tempmail.dev', 'tempmailo.com', 'tempr.email', 'throwawaymail.com', 'tmail.ws', 'trashmail.com',
  'trashmail.de', 'yopmail.com', 'yopmail.net', 'emailnator.com', 'tmpmail.org', 'tmpmail.net',
])

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase()
}

export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email)
  if (DISPOSABLE_DOMAINS.has(domain)) return true
  for (const d of DISPOSABLE_DOMAINS) if (domain.endsWith(`.${d}`)) return true
  return false
}

const DOTLESS_LOCALPART = new Set(['gmail.com', 'googlemail.com'])

/** The mailbox an address lands in: plus tags dropped, Gmail dots ignored. */
export function canonicalMailbox(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return email.trim().toLowerCase()
  let local = email.slice(0, at).trim().toLowerCase()
  let domain = emailDomain(email)
  const plus = local.indexOf('+')
  if (plus > 0) local = local.slice(0, plus)
  if (DOTLESS_LOCALPART.has(domain)) {
    local = local.replace(/\./g, '')
    domain = 'gmail.com'
  }
  return `${local}@${domain}`
}

/**
 * saasrow's spam guards for an invite bonus. The new account has already
 * proved its inbox (an emailed code or link); this decides whether paying
 * Premium days to both sides is safe. Blocked invites still count as accepted,
 * only the bonus is withheld.
 */
export function bonusVerdict(input: {
  inviterEmail: string
  inviteeEmail: string
  inviterIpHash: string | null
  inviteeIpHash: string | null
  inviteePendingListings: number
  inviteeBlocked?: boolean
}): Verdict {
  if (input.inviteeBlocked) return { ok: false, reason: 'account flagged' }
  if (canonicalMailbox(input.inviterEmail) === canonicalMailbox(input.inviteeEmail)) {
    return { ok: false, reason: 'same mailbox' }
  }
  if (isDisposableEmail(input.inviteeEmail)) return { ok: false, reason: 'disposable email' }
  if (input.inviterIpHash && input.inviteeIpHash && input.inviterIpHash === input.inviteeIpHash) {
    return { ok: false, reason: 'same network as the inviter' }
  }
  if (input.inviteePendingListings > INVITEE_MAX_PENDING_LISTINGS) {
    return { ok: false, reason: 'too many listings in review' }
  }
  return { ok: true }
}

/** Invite codes look like INV-XXXX-XXXX-XXXX; anything else is not worth a lookup. */
export function looksLikeInviteCode(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const compact = value.toUpperCase().replace(/[^0-9A-Z]/g, '')
  const body = compact.startsWith('INV') ? compact.slice(3) : compact
  return body.length === 12
}

const ALLOWED_HOSTS = /^(?:www\.)?saasrow\.com$|^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/

/**
 * The site origin for links we hand out, from the request's own host (so a
 * dev or preview host builds links to itself), falling back to the canonical
 * apex for anything we do not recognise.
 */
export function siteOriginFrom(headers: Headers, fallback = 'https://saasrow.com'): string {
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').split(',')[0].trim().toLowerCase()
  if (!host || !ALLOWED_HOSTS.test(host)) return fallback
  if (host === 'www.saasrow.com') return 'https://saasrow.com'
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1')
  const proto = (headers.get('x-forwarded-proto') ?? (local ? 'http' : 'https')).split(',')[0].trim()
  return `${proto === 'http' ? 'http' : 'https'}://${host}`
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin}/i/${encodeURIComponent(code)}`
}

export type RedeemReason = 'invalid' | 'expired' | 'used_up' | 'already_redeemed' | 'revoked'

export function redeemReasonMessage(reason: RedeemReason): string {
  switch (reason) {
    case 'invalid':
      return 'That code is not valid. Check it and try again.'
    case 'expired':
      return 'That code has expired.'
    case 'used_up':
      return 'That code has already been used.'
    case 'already_redeemed':
      return 'You have already redeemed that code.'
    case 'revoked':
      return 'That code is no longer valid.'
  }
}

export type InviteReason = 'invalid' | 'expired' | 'used' | 'self' | 'revoked'

export function inviteReasonMessage(reason: InviteReason): string {
  switch (reason) {
    case 'invalid':
      return 'That invite code is not valid.'
    case 'expired':
      return 'That invite has expired. Ask for a new one.'
    case 'used':
      return 'That invite has already been used.'
    case 'self':
      return 'You cannot accept your own invite.'
    case 'revoked':
      return 'That invite was withdrawn.'
  }
}
