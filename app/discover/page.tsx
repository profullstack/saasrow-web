import type { Metadata } from 'next'
import Discover from '@/views/Discover'

export const metadata: Metadata = {
  title: 'Discover',
  description: 'Discover new software on SaaSRow.',
}

export default function Page() {
  return <Discover />
}
