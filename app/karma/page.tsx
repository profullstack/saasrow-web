import type { Metadata } from 'next'
import Karma from '@/views/Karma'

export const metadata: Metadata = {
  title: 'Your karma',
  description: 'Your SaaSRow karma: points for upvotes, reviews, comments and shares, and free Featured weeks.',
  robots: { index: false },
}

export default function Page() {
  return <Karma />
}
