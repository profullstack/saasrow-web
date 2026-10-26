'use client'

import Link from 'next/link'
import { Zap } from 'lucide-react'
import { useMember } from '@/lib/member'

/** Opens the header's Sign in dialog from anywhere on the page. */
export function openSignIn() {
  window.dispatchEvent(new Event('saasrow-open-signin'))
}

/** For signed-out visitors: what signing in earns. Signed in: where they stand. */
export function EarnKarmaNudge() {
  const { member, karma } = useMember()

  if (member) {
    if (!karma) return null
    return (
      <p className="mt-4 text-sm font-ubuntu text-white/60">
        <Zap className="inline w-4 h-4 text-[#4FFFE3] mr-1" />
        You have <Link href="/karma" className="text-[#4FFFE3] hover:underline">{karma.total.toLocaleString()} karma</Link>
        {' · '}
        {karma.next_credit.remaining.toLocaleString()} more for a free Featured week
      </p>
    )
  }

  return (
    <p className="mt-4 text-sm font-ubuntu text-white/60">
      <Zap className="inline w-4 h-4 text-[#4FFFE3] mr-1" />
      <button onClick={openSignIn} className="text-[#4FFFE3] hover:underline">Sign in</button>
      {' '}to earn karma: +1 per upvote and share, +5 for a review. Every 500 karma is a free Featured week.{' '}
      <Link href="/leaderboard" className="underline hover:text-white">Leaderboard</Link>
    </p>
  )
}
