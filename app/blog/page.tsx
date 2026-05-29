import type { Metadata } from 'next'
import { getBlogList } from '@/lib/api'
import BlogPage from '@/views/Blog'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Articles, guides, and insights about software and productivity',
}

export default async function Page() {
  const posts = await getBlogList()
  return <BlogPage initialPosts={posts} />
}
