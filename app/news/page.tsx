import type { Metadata } from 'next'
import News from '@/views/News'
import { getNewsList } from '@/lib/api'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'News & Updates',
  description: 'Stay updated with the latest software, tools, and tech news from SaaSRow.',
  alternates: { canonical: '/news' },
}

export default async function Page() {
  const items = await getNewsList()
  const normalized = items.map((n) => ({ ...n, excerpt: n.excerpt ?? '' }))
  return <News initialNewsItems={normalized} />
}
