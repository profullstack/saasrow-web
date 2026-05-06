import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import NewsPost from '@/views/NewsPost'
import { getNewsItem } from '@/lib/api'

export const revalidate = 60

interface RouteProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params
  const post = await getNewsItem(id)
  if (!post) {
    return { title: 'Not Found', robots: { index: false, follow: false } }
  }
  const description = (post.excerpt ?? '').slice(0, 160)
  return {
    title: post.title,
    description,
    alternates: { canonical: `/news/${post.slug}` },
    openGraph: {
      title: post.title,
      description,
      url: `/news/${post.slug}`,
      type: 'article',
      images: post.banner_image ? [post.banner_image] : undefined,
      publishedTime: post.created_at,
    },
    twitter: {
      card: post.banner_image ? 'summary_large_image' : 'summary',
      title: post.title,
      description,
      images: post.banner_image ? [post.banner_image] : undefined,
    },
  }
}

export default async function Page({ params }: RouteProps) {
  const { id } = await params
  const post = await getNewsItem(id)
  if (!post) {
    notFound()
  }
  const normalized = {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt ?? '',
    content: post.content ?? '',
    created_at: post.created_at,
    banner_image: post.banner_image,
  }
  return <NewsPost initialPost={normalized} />
}
