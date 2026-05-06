import type { Metadata } from 'next'
import Category from '@/views/Category'
import { getSubmissionsByCategory } from '@/lib/api'

export const revalidate = 60

interface RouteProps {
  params: Promise<{ category: string }>
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { category } = await params
  const decoded = decodeURIComponent(category)
  const display = decoded.charAt(0).toUpperCase() + decoded.slice(1)
  return {
    title: `${display} Software`,
    description: `Browse ${display.toLowerCase()} software on SaaSRow.`,
    alternates: { canonical: `/category/${decoded.toLowerCase()}` },
    openGraph: {
      title: `${display} Software | SaaSRow`,
      description: `Browse ${display.toLowerCase()} software on SaaSRow.`,
      url: `/category/${decoded.toLowerCase()}`,
      type: 'website',
    },
  }
}

export default async function Page({ params }: RouteProps) {
  const { category } = await params
  const decoded = decodeURIComponent(category)
  const submissions = await getSubmissionsByCategory(decoded)
  return <Category initialSubmissions={submissions} />
}
