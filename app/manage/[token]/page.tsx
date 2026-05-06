import type { Metadata } from 'next'
import ManageListings from '@/views/ManageListings'

export const metadata: Metadata = {
  title: 'Manage Listings',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ManageListings />
}
