import { describe, it, expect } from 'vitest'
import {
  INVITEE_MAX_PENDING_LISTINGS,
  bonusVerdict,
  canAcceptInvite,
  canSendInvites,
  canonicalMailbox,
  inviteUrl,
  isDisposableEmail,
  looksLikeInviteCode,
  siteOriginFrom,
} from '@/lib/inviteRules'

const NOW = Date.parse('2026-10-26T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

describe('canSendInvites', () => {
  it('opens at 7 days old or with an approved listing', () => {
    expect(canSendInvites({ accountCreatedAt: daysAgo(1), hasApprovedListing: false }, NOW).ok).toBe(false)
    expect(canSendInvites({ accountCreatedAt: daysAgo(7), hasApprovedListing: false }, NOW).ok).toBe(true)
    expect(canSendInvites({ accountCreatedAt: daysAgo(0), hasApprovedListing: true }, NOW).ok).toBe(true)
    expect(canSendInvites({ accountCreatedAt: null, hasApprovedListing: false }, NOW).ok).toBe(false)
  })
})

describe('canAcceptInvite', () => {
  it('only new accounts with no old listings', () => {
    expect(canAcceptInvite({ accountCreatedAt: daysAgo(0), oldestListingAt: null }, NOW).ok).toBe(true)
    expect(canAcceptInvite({ accountCreatedAt: daysAgo(8), oldestListingAt: null }, NOW).ok).toBe(false)
    // An old listing owner signing in for the first time gets a fresh users row: still not new.
    expect(canAcceptInvite({ accountCreatedAt: daysAgo(0), oldestListingAt: daysAgo(90) }, NOW).ok).toBe(false)
    expect(canAcceptInvite({ accountCreatedAt: daysAgo(0), oldestListingAt: daysAgo(1) }, NOW).ok).toBe(true)
  })
})

describe('bonusVerdict (spam guards)', () => {
  const base = {
    inviterEmail: 'alice@example.com',
    inviteeEmail: 'carol@example.org',
    inviterIpHash: 'aaa',
    inviteeIpHash: 'bbb',
    inviteePendingListings: 0,
  }
  it('pays a clean invite', () => {
    expect(bonusVerdict(base)).toEqual({ ok: true })
  })
  it('withholds for the same mailbox under an alias', () => {
    expect(bonusVerdict({ ...base, inviterEmail: 'a.lice@gmail.com', inviteeEmail: 'alice+2@googlemail.com' }).ok).toBe(false)
  })
  it('withholds for a disposable inbox', () => {
    expect(bonusVerdict({ ...base, inviteeEmail: 'x@mailinator.com' })).toEqual({ ok: false, reason: 'disposable email' })
  })
  it('withholds when both sides share a network', () => {
    expect(bonusVerdict({ ...base, inviteeIpHash: 'aaa' }).ok).toBe(false)
    expect(bonusVerdict({ ...base, inviterIpHash: null, inviteeIpHash: null }).ok).toBe(true)
  })
  it('withholds for a submission burst', () => {
    expect(bonusVerdict({ ...base, inviteePendingListings: INVITEE_MAX_PENDING_LISTINGS + 1 }).ok).toBe(false)
    expect(bonusVerdict({ ...base, inviteePendingListings: INVITEE_MAX_PENDING_LISTINGS }).ok).toBe(true)
  })
})

describe('helpers', () => {
  it('canonicalMailbox drops plus tags and gmail dots only', () => {
    expect(canonicalMailbox('A.B+x@Gmail.com')).toBe('ab@gmail.com')
    expect(canonicalMailbox('a.b+x@example.com')).toBe('a.b@example.com')
  })
  it('isDisposableEmail matches subdomains', () => {
    expect(isDisposableEmail('a@yopmail.com')).toBe(true)
    expect(isDisposableEmail('a@eu.yopmail.com')).toBe(true)
    expect(isDisposableEmail('a@gmail.com')).toBe(false)
  })
  it('looksLikeInviteCode', () => {
    expect(looksLikeInviteCode('INV-7K3M-QX9D-2F8H')).toBe(true)
    expect(looksLikeInviteCode('inv 7k3m qx9d 2f8h')).toBe(true)
    expect(looksLikeInviteCode('7K3MQX9D2F8H')).toBe(true)
    expect(looksLikeInviteCode('CR-7K3M-QX9D-2F8H-W4TN')).toBe(false)
    expect(looksLikeInviteCode(42)).toBe(false)
  })
  it('siteOriginFrom uses the request host, never a foreign one', () => {
    expect(siteOriginFrom(new Headers({ host: 'saasrow.com' }))).toBe('https://saasrow.com')
    expect(siteOriginFrom(new Headers({ host: 'www.saasrow.com' }))).toBe('https://saasrow.com')
    expect(siteOriginFrom(new Headers({ host: 'localhost:3000' }))).toBe('http://localhost:3000')
    expect(siteOriginFrom(new Headers({ 'x-forwarded-host': 'evil.example', host: 'saasrow.com' }))).toBe('https://saasrow.com')
    expect(siteOriginFrom(new Headers({ 'x-forwarded-host': 'saasrow.com', 'x-forwarded-proto': 'https', host: '127.0.0.1:3000' }))).toBe('https://saasrow.com')
  })
  it('inviteUrl', () => {
    expect(inviteUrl('https://saasrow.com', 'INV-AAAA-BBBB-CCCC')).toBe('https://saasrow.com/i/INV-AAAA-BBBB-CCCC')
  })
})
