import type { Metadata } from 'next'
import Community from '@/views/Community'

export const metadata: Metadata = {
  title: 'Community',
  description: 'Join the SaaSRow community.',
}

export default function Page() {
  return <Community />
}
