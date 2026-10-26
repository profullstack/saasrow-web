import type { Metadata } from 'next'
import Invites from '@/views/Invites'

export const metadata: Metadata = {
  title: 'Your invites',
  description: 'Invite people to SaaSRow: you both get days of Premium when they join.',
  robots: { index: false },
}

export default function Page() {
  return <Invites />
}
