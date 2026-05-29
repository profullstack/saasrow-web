import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import BlogPost from '@/views/BlogPost'
import { getBlogPost } from '@/lib/api'

export const revalidate = 60

interface RouteProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getBlogPost(slug)
  if (!post) {
    return { title: 'Not Found', robots: { index: false, follow: false } }
  }
  const description = (post.excerpt ?? '').slice(0, 160)
  return {
    title: post.title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description,
      url: `/blog/${post.slug}`,
      type: 'article',
      images: post.featured_image_url ? [post.featured_image_url] : undefined,
      publishedTime: post.published_at,
    },
    twitter: {
      card: post.featured_image_url ? 'summary_large_image' : 'summary',
      title: post.title,
      description,
      images: post.featured_image_url ? [post.featured_image_url] : undefined,
    },
  }
}

export default async function Page({ params }: RouteProps) {
  const { slug } = await params
  const post = await getBlogPost(slug)
  if (!post) notFound()
  return <BlogPost initialPost={post} />
}
