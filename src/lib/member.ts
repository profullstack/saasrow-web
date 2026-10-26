'use client'

import { useEffect, useState } from 'react'

// The website's member session: who is signed in, for karma.
//
// Sign in emails a one-time code (the same codes as `saasrow login`); the
// server trades it for a "Website" API key and keeps that in an HttpOnly cookie
// (src/lib/memberSession.ts), so scripts on the page never see it. Opening a
// /manage link signs you in the same way with that link's token. All this
// browser keeps is the email, as a hint that a session exists.

const STORAGE_KEY = 'saasrow_member'
const CHANGED = 'saasrow-member-changed'

export interface MemberCredential {
  email: string
}

export interface KarmaSummary {
  email: string
  total: number
  week: number
  player: string
  display_name: string | null
  staff: boolean
  badges: Array<{ id: string; emoji: string; label: string }>
  credits: {
    available: number
    granted: number
    spent: number
    list: Array<{
      id: string
      milestone: number
      spent_at: string | null
      featured_until: string | null
      product: { id: string; title: string | null } | null
    }>
  }
  next_credit: { at: number; remaining: number; per: number; progress: number }
  events: Array<{
    action: string
    label: string
    points: number
    reversal: boolean
    at: string
    product: { id: string; title: string | null } | null
  }>
  how_to_earn: Array<{ action: string; points: number; daily_cap: number | null; label: string; rule: string }>
}

export interface KarmaPayout {
  paid: boolean
  points?: number
  reason?: string
}

export function getMember(): MemberCredential | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const m = raw ? (JSON.parse(raw) as Partial<MemberCredential> & Record<string, unknown>) : null
    // Sessions from before the cookie kept the key here: drop them, sign in again.
    if (!m?.email || 'apiKey' in m || 'managementToken' in m) return null
    return { email: m.email }
  } catch {
    return null
  }
}

function setMember(m: MemberCredential | null) {
  try {
    if (m) localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: m.email }))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked (private window): the cookie still works, the hint does not.
  }
  window.dispatchEvent(new Event(CHANGED))
}

/** The header that lets the server read the member cookie (no cross-site form can send it). */
export function memberHeaders(): Record<string, string> {
  return { 'X-Saasrow-Member': '1' }
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string }
  return typeof json.error === 'string' ? json.error : json.error?.message ?? fallback
}

/** fetch() against our own API as the signed-in member. Throws the API's message on failure. */
export async function memberFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...memberHeaders() },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (!res.ok) {
    if (res.status === 401) setMember(null)
    throw new Error(await errorMessage(res, 'Request failed'))
  }
  return (await res.json()) as T
}

/** Step one: email a sign-in code. */
export async function requestSignInCode(email: string): Promise<void> {
  const res = await fetch('/api/v1/auth/cli', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, source: 'web' }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, 'Could not send a code'))
}

/** Step two: trade the code for a session cookie. */
export async function verifySignInCode(email: string, code: string): Promise<MemberCredential> {
  const res = await fetch('/api/v1/auth/web', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, 'That code did not work'))
  const m = { email: ((await res.json()) as { email: string }).email }
  setMember(m)
  return m
}

/** A /manage link signs you in too, unless you already are. */
export function adoptManagementToken(token: string) {
  if (!token || getMember()) return
  fetch('/api/v1/auth/web', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((me: { email?: string } | null) => {
      if (me?.email) setMember({ email: me.email })
    })
    .catch(() => undefined)
}

/** Sign out: the server revokes the website key and clears the cookie. */
export async function signOut() {
  await fetch('/api/v1/auth/web', { method: 'DELETE', credentials: 'same-origin', headers: memberHeaders() }).catch(
    () => undefined,
  )
  setMember(null)
}

/** Tell every karma widget on the page to refetch (after a vote, comment or share pays). */
export function karmaChanged() {
  window.dispatchEvent(new Event(CHANGED))
}

/** The signed-in member and their karma summary; re-reads when either changes. */
export function useMember() {
  const [member, setMemberState] = useState<MemberCredential | null>(null)
  const [karma, setKarma] = useState<KarmaSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      const m = getMember()
      setMemberState(m)
      if (!m) {
        setKarma(null)
        return
      }
      memberFetch<KarmaSummary>('/api/v1/me/karma')
        .then((k) => !cancelled && setKarma(k))
        .catch(() => !cancelled && setKarma(null))
    }
    load()
    window.addEventListener(CHANGED, load)
    window.addEventListener('storage', load)
    return () => {
      cancelled = true
      window.removeEventListener(CHANGED, load)
      window.removeEventListener('storage', load)
    }
  }, [])

  return { member, karma }
}

/** "+2 karma", or why nothing was paid, for a toast. */
export function payoutText(k: KarmaPayout | null | undefined): string | null {
  if (!k) return null
  if (k.paid) return `+${k.points} karma`
  if (k.reason === 'staff' || k.reason === 'already paid' || k.reason === 'anonymous') return null
  return k.reason ? `No karma: ${k.reason}` : null
}
