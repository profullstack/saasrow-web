import type { Metadata } from 'next'
import Terms from '@/views/Terms'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for SaaSRow.',
}

export default function Page() {
  return <Terms />
}
