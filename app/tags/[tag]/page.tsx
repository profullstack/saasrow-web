import type { Metadata } from 'next'
import Tags from '@/views/Tags'
import { getSubmissionsByTag } from '@/lib/api'

export const revalidate = 60

interface RouteProps {
  params: Promise<{ tag: string }>
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { tag } = await params
  const decoded = decodeURIComponent(tag)
  return {
    title: `#${decoded}`,
    description: `Software tagged with "${decoded}" on SaaSRow.`,
    alternates: { canonical: `/tags/${decoded.toLowerCase()}` },
    openGraph: {
      title: `#${decoded} | SaaSRow`,
      description: `Software tagged with "${decoded}".`,
      url: `/tags/${decoded.toLowerCase()}`,
      type: 'website',
    },
  }
}

export default async function Page({ params }: RouteProps) {
  const { tag } = await params
  const decoded = decodeURIComponent(tag)
  const software = await getSubmissionsByTag(decoded)
  return <Tags initialSoftware={software} />
}
