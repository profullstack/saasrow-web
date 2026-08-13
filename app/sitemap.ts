import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getBlogList, getNewsList } from '@/lib/api'

// Regenerate at most hourly so new listings/posts get picked up without
// rebuilding the whole site.
export const revalidate = 3600

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.saasrow.com').replace(
  /\/+$/,
  '',
)

type SitemapSubmission = {
  id: string
  created_at: string | null
  category: string | null
  tags: string[] | null
}

// Fetch ALL approved listings directly (service role) — the public `submissions`
// edge function caps at 50, which would truncate the sitemap.
async function getApprovedSubmissions(): Promise<SitemapSubmission[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return []
  try {
    const admin = createClient(url, key, { auth: { persistSession: false } })
    const { data } = await admin
      .from('software_submissions')
      .select('id, created_at, category, tags')
      .eq('status', 'approved')
    return (data ?? []) as SitemapSubmission[]
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [submissions, blog, news] = await Promise.all([
    getApprovedSubmissions(),
    getBlogList().catch(() => []),
    getNewsList().catch(() => []),
  ])

  // Static, indexable pages (admin / manage / unsubscribe / favorites are
  // intentionally excluded).
  const staticPaths = [
    '',
    '/about',
    '/blog',
    '/categories',
    '/community',
    '/discover',
    '/distribution',
    '/explore',
    '/featured',
    '/news',
    '/privacy',
    '/submit',
    '/tags',
    '/terms',
  ]
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${SITE}${p}`,
    changeFrequency: p === '' ? 'daily' : 'weekly',
    priority: p === '' ? 1 : 0.7,
  }))

  // Approved directory listings → /software/[id]
  const softwareEntries: MetadataRoute.Sitemap = submissions.map((s) => ({
    url: `${SITE}/software/${s.id}`,
    lastModified: s.created_at ? new Date(s.created_at) : undefined,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  // Category + tag landing pages (links are lowercased in the app)
  const categories = [
    ...new Set(
      submissions.map((s) => s.category).filter((c): c is string => Boolean(c)),
    ),
  ]
  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${SITE}/category/${encodeURIComponent(c.toLowerCase())}`,
    changeFrequency: 'weekly',
    priority: 0.5,
  }))

  const tags = [
    ...new Set(submissions.flatMap((s) => s.tags ?? []).filter(Boolean)),
  ]
  const tagEntries: MetadataRoute.Sitemap = tags.map((t) => ({
    url: `${SITE}/tags/${encodeURIComponent(t.toLowerCase())}`,
    changeFrequency: 'weekly',
    priority: 0.4,
  }))

  // Blog posts → /blog/[slug]
  const blogEntries: MetadataRoute.Sitemap = blog.map((b) => ({
    url: `${SITE}/blog/${b.slug}`,
    lastModified: new Date(b.published_at || b.created_at),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  // News posts → /news/[slug]
  const newsEntries: MetadataRoute.Sitemap = news.map((n) => ({
    url: `${SITE}/news/${n.slug}`,
    lastModified: n.created_at ? new Date(n.created_at) : undefined,
    changeFrequency: 'monthly',
    priority: 0.5,
  }))

  return [
    ...staticEntries,
    ...softwareEntries,
    ...categoryEntries,
    ...tagEntries,
    ...blogEntries,
    ...newsEntries,
  ]
}
