import type { Metadata } from 'next'
import Detailed from '@/views/Detailed'

export const metadata: Metadata = {
  title: 'Detailed',
}

export default function Page() {
  return <Detailed />
}
