import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import SoftwareDetail from '@/views/SoftwareDetail'
import { getSubmissionById, getPublicStorageUrl } from '@/lib/api'

export const revalidate = 60

interface RouteProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params
  const submission = await getSubmissionById(id)
  if (!submission) {
    return {
      title: 'Not Found',
      robots: { index: false, follow: false },
    }
  }
  const description = submission.description?.slice(0, 160) ?? ''
  const ogImage = submission.image
    ? getPublicStorageUrl('software-images', submission.image)
    : submission.logo
      ? getPublicStorageUrl('software-logos', submission.logo)
      : undefined
  return {
    title: submission.title,
    description,
    alternates: { canonical: `/software/${submission.id}` },
    openGraph: {
      title: submission.title,
      description,
      url: `/software/${submission.id}`,
      type: 'article',
      images: ogImage ? [ogImage] : undefined,
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: submission.title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  }
}

export default async function Page({ params }: RouteProps) {
  const { id } = await params
  const submission = await getSubmissionById(id)
  if (!submission) {
    notFound()
  }
  return <SoftwareDetail initialSubmission={submission} />
}
