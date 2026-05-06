import type { Metadata } from 'next'
import Categories from '@/views/Categories'
import { getCategoryCounts } from '@/lib/api'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Browse by Categories',
  description: 'Browse software by category on SaaSRow.',
  alternates: { canonical: '/categories' },
}

export default async function Page() {
  const categories = await getCategoryCounts()
  return <Categories initialCategories={categories} />
}
