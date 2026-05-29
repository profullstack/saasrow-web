import type { Metadata } from 'next'
import EmailBroadcast from '@/views/EmailBroadcast'

export const metadata: Metadata = {
  title: 'Email Broadcast - Admin',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <EmailBroadcast />
}
