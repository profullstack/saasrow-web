import type { Metadata } from 'next'
import { Suspense } from 'react'
import Unsubscribe from '@/views/Unsubscribe'

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Unsubscribe />
    </Suspense>
  )
}
