import type { Metadata } from 'next'
import { Favorites } from '@/views/Favorites'

export const metadata: Metadata = {
  title: 'My Favorites',
  description: 'Software you have bookmarked on SaaSRow.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <Favorites />
}
