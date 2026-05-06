import type { Metadata } from 'next'
import Tags from '@/views/Tags'
import { getTagCounts } from '@/lib/api'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Browse by Tags',
  description: 'Browse software by tag on SaaSRow.',
  alternates: { canonical: '/tags' },
}

export default async function Page() {
  const tags = await getTagCounts()
  return <Tags initialTags={tags} />
}
