import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import SoftwareDetail from '@/views/SoftwareDetail'
import JsonLd from '@/components/JsonLd'
import { getSubmissionById, getPublicStorageUrl } from '@/lib/api'
import { softwareApplicationLd, breadcrumbLd } from '@/lib/structuredData'
import AdultListing from '@/views/AdultListing'
import { isAdultListing } from '@/lib/adult'
import { ADULT_LABEL } from '@/lib/adultShared'

export const revalidate = 60

interface RouteProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params
  const submission = await getSubmissionById(id)
  if (!submission) {
    // An Adult (18+) listing gets a members-only shell: no name, no description.
    return {
      title: (await isAdultListing(id)) ? ADULT_LABEL : 'Not Found',
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
    alternates: {
      canonical: `/software/${submission.id}`,
      // Advertise the agent-friendly renderings alongside the HTML page.
      types: {
        'text/markdown': `/software/${submission.id}/markdown`,
        'application/json': `/api/v1/products/${submission.id}`,
      },
    },
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
    // Adult (18+): the page carries nothing about the listing. The view asks
    // the member API for it, and shows a sign-in prompt to everyone else.
    if (await isAdultListing(id)) return <AdultListing id={id} />
    notFound()
  }
  return (
    <>
      <JsonLd data={softwareApplicationLd(submission)} />
      <JsonLd data={breadcrumbLd(submission)} />
      <SoftwareDetail initialSubmission={submission} />
    </>
  )
}
