import type { Metadata } from 'next'
import Submit from '@/views/Submit'

export const metadata: Metadata = {
  title: 'Submit Software',
  description: 'Submit your software for free to the SaaSRow directory.',
}

export default function Page() {
  return <Submit />
}
