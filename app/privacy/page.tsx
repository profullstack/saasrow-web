import type { Metadata } from 'next'
import Privacy from '@/views/Privacy'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for SaaSRow.',
}

export default function Page() {
  return <Privacy />
}
