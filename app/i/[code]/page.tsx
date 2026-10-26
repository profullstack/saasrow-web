import type { Metadata } from 'next'
import InviteLanding from '@/views/InviteLanding'
import { peekInvite } from '@/lib/credits'
import { INVITE_BONUS_DAYS } from '@/lib/inviteRules'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "You're invited to SaaSRow",
  description: 'A SaaSRow member invited you. Join and you both get days of Premium.',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ code: string }> }

export default async function Page({ params }: Props) {
  const { code: raw } = await params
  const code = decodeURIComponent(raw).slice(0, 40)
  const peek = await peekInvite(code).catch(() => ({ valid: false, reason: 'We could not check that invite right now.' }))
  return <InviteLanding code={code} bonusDays={INVITE_BONUS_DAYS} {...peek} />
}
