import type { Metadata } from 'next'
import About from '@/views/About'

export const metadata: Metadata = {
  title: 'About',
  description: 'About SaaSRow — discover and submit software in our directory.',
}

export default function Page() {
  return <About />
}
