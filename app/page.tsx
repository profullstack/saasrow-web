import type { Metadata } from 'next'
import HomePage from '@/views/Home'
import { getAllSubmissions } from '@/lib/api'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'SaaSRow - Software Directory',
  description:
    'Discover, vote on, and submit software in the SaaSRow directory. Free listings with DoFollow backlinks.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'SaaSRow - Software Directory',
    description:
      'Discover, vote on, and submit software in the SaaSRow directory.',
    url: '/',
    type: 'website',
  },
}

export default async function Page() {
  const submissions = await getAllSubmissions()
  return <HomePage initialListings={submissions} />
}
