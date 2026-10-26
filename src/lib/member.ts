'use client'

import { useEffect, useState } from 'react'

// The website's member session: who is signed in, for karma.
//
// Sign in emails a one-time code (the same codes as `saasrow login`) and trades
// it for an API key named "Website", kept in this browser. Opening a /manage
// link also signs you in, with that link's token. Either credential resolves to
// the same `users` row on the server (src/lib/apiAuth.ts).

const STORAGE_KEY = 'saasrow_member'
const CHANGED = 'saasrow-member-changed'

export interface MemberCredential {
  email: string
  apiKey?: string
  keyId?: string
  managementToken?: string
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
    const m = raw ? (JSON.parse(raw) as MemberCredential) : null
    return m && (m.apiKey || m.managementToken) ? m : null
  } catch {
    return null
  }
}

function setMember(m: MemberCredential | null) {
  try {
    if (m) localStorage.setItem(STORAGE_KEY, JSON.stringify(m))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked (private window): the session lasts only this page.
  }
  window.dispatchEvent(new Event(CHANGED))
}

export function memberHeaders(m: MemberCredential | null = getMember()): Record<string, string> {
  if (!m) return {}
  if (m.apiKey) return { Authorization: `Bearer ${m.apiKey}` }
  if (m.managementToken) return { 'X-Management-Token': m.managementToken }
  return {}
}

/** fetch() against our own API as the signed-in member. Throws the API's message on failure. */
export async function memberFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...memberHeaders() },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) setMember(null)
    const message = (json as { error?: { message?: string } | string }).error
    throw new Error(typeof message === 'string' ? message : message?.message ?? 'Request failed')
  }
  return json as T
}

/** Step one: email a sign-in code. */
export async function requestSignInCode(email: string): Promise<void> {
  const res = await fetch('/api/v1/auth/cli', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, source: 'web' }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: { message?: string } }).error?.message ?? 'Could not send a code')
  }
}

/** Step two: trade the code for a key, kept in this browser. */
export async function verifySignInCode(email: string, code: string): Promise<MemberCredential> {
  const res = await fetch('/api/v1/auth/cli/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, key_name: 'Website' }),
  })
  const json = (await res.json().catch(() => ({}))) as {
    api_key?: string
    key?: { id: string }
    user?: { email: string }
    error?: { message?: string }
  }
  if (!res.ok || !json.api_key) throw new Error(json.error?.message ?? 'That code did not work')
  const m = { email: json.user?.email ?? email, apiKey: json.api_key, keyId: json.key?.id }
  setMember(m)
  return m
}

/** A /manage link signs you in too, unless you already are. */
export function adoptManagementToken(token: string) {
  if (!token || getMember()) return
  fetch('/api/v1/me', { headers: { 'X-Management-Token': token } })
    .then((r) => (r.ok ? r.json() : null))
    .then((me: { user?: { email: string } } | null) => {
      if (me?.user?.email) setMember({ email: me.user.email, managementToken: token })
    })
    .catch(() => undefined)
}

/** Forget this browser's session, and revoke its key so it cannot be reused. */
export async function signOut() {
  const m = getMember()
  if (m?.apiKey && m.keyId) {
    await fetch(`/api/v1/keys/${m.keyId}`, { method: 'DELETE', headers: memberHeaders(m) }).catch(() => undefined)
  }
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
