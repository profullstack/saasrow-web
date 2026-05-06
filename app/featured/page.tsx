import type { Metadata } from 'next'
import Featured from '@/views/Featured'

export const metadata: Metadata = {
  title: 'Get Featured',
  description: 'Featured listing plans for SaaSRow.',
}

export default function Page() {
  return <Featured />
}
