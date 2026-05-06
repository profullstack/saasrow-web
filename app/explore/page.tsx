import type { Metadata } from 'next'
import Explore from '@/views/Explore'

export const metadata: Metadata = {
  title: 'Explore',
  description: 'Explore software on SaaSRow.',
}

export default function Page() {
  return <Explore />
}
