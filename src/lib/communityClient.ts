'use client'

import { callFn } from './clientApi'
import { getMember, karmaChanged, memberFetch, payoutText, type KarmaPayout } from './member'
import type { ShareNetwork } from './karmaRules'

// Votes and shares from any page. A signed-in member goes through the karma API
// (and earns); everyone else through the anonymous edge functions, as before.

type VoteType = 'upvote' | 'downvote'

export interface VoteState {
  voteType: VoteType | null
  upvotes: number
  downvotes: number
}

const anonKey = (id: string) => `vote_${id}`

/** A brief "+1 karma" toast; KarmaToast in the layout shows it. */
export function toastKarma(k: KarmaPayout | null | undefined) {
  const text = payoutText(k)
  if (!text) return
  window.dispatchEvent(new CustomEvent('saasrow-karma-toast', { detail: text }))
  if (k?.paid) karmaChanged()
}

export async function loadMyVote(id: string): Promise<VoteType | null> {
  if (getMember()) {
    try {
      return (await memberFetch<VoteState>(`/api/v1/products/${id}/vote`)).voteType
    } catch {
      return null
    }
  }
  try {
    return (localStorage.getItem(anonKey(id)) as VoteType | null) ?? null
  } catch {
    return null
  }
}

export async function castVote(id: string, voteType: VoteType): Promise<VoteState & { member: boolean }> {
  if (getMember()) {
    const r = await memberFetch<VoteState & { karma: KarmaPayout | null }>(`/api/v1/products/${id}/vote`, {
      method: 'POST',
      body: { vote_type: voteType },
    })
    toastKarma(r.karma)
    return { voteType: r.voteType, upvotes: r.upvotes, downvotes: r.downvotes, member: true }
  }

  const response = await callFn('vote', { method: 'POST', body: { submissionId: id, voteType } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Failed to vote')
  try {
    if (result.voteType) localStorage.setItem(anonKey(id), result.voteType)
    else localStorage.removeItem(anonKey(id))
  } catch {
    // Storage blocked: the vote still counted.
  }
  return { voteType: result.voteType, upvotes: result.upvotes, downvotes: result.downvotes, member: false }
}

/** Count the share (everyone) and pay it (members). */
export async function recordShare(id: string, network: ShareNetwork): Promise<{ shareCount?: number; isTrending?: boolean }> {
  const counted = callFn('track-share', { method: 'POST', body: { submissionId: id } })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  if (getMember()) {
    memberFetch<{ karma: KarmaPayout }>(`/api/v1/products/${id}/share`, { method: 'POST', body: { network } })
      .then((r) => toastKarma(r.karma))
      .catch(() => undefined)
  }
  return counted
}
