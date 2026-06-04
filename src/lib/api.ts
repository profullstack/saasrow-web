import 'server-only'
import {
  filterByCategory,
  filterByTag,
  categoryCountsFrom,
  tagCountsFrom,
  type CategoryCount,
  type TagCount,
  type Submission,
} from './submissions'

export type { Submission, CategoryCount, TagCount } from './submissions'

export interface NewsItem {
  id: string
  slug: string
  title: string
  excerpt?: string
  content?: string
  banner_image?: string
  created_at: string
}

const REVALIDATE_SECONDS = 60

function requireEnv(): { url: string; anon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('Supabase env vars not configured')
  }
  return { url, anon }
}

async function fetchEdgeFn<T>(path: string, init?: RequestInit & { revalidate?: number }): Promise<T> {
  const { url, anon } = requireEnv()
  const apiUrl = `${url}/functions/v1/${path}`
  const { revalidate, ...rest } = init ?? {}
  const res = await fetch(apiUrl, {
    ...rest,
    headers: {
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
      ...(rest.headers ?? {}),
    },
    next: { revalidate: revalidate ?? REVALIDATE_SECONDS },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Edge fn ${path} failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

export async function getAllSubmissions(): Promise<Submission[]> {
  try {
    const result = await fetchEdgeFn<{ data?: Submission[] }>('submissions')
    return result.data ?? []
  } catch (err) {
    console.error('[api] getAllSubmissions failed', err)
    return []
  }
}

export async function getSubmissionById(id: string): Promise<Submission | null> {
  // Query directly by ID so we find items regardless of the edge function's
  // status filter or pagination limit.
  try {
    const { createSupabaseServerClient } = await import('./supabaseServer')
    const sb = await createSupabaseServerClient()
    const { data, error } = await sb
      .from('software_submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (!error && data) return data as Submission
  } catch {
    // fall through to edge function fallback
  }
  const all = await getAllSubmissions()
  return all.find((s) => s.id === id) ?? null
}

export async function getSubmissionsByCategory(category: string): Promise<Submission[]> {
  return filterByCategory(await getAllSubmissions(), category)
}

export async function getSubmissionsByTag(tag: string): Promise<Submission[]> {
  return filterByTag(await getAllSubmissions(), tag)
}

export async function getCategoryCounts(): Promise<CategoryCount[]> {
  return categoryCountsFrom(await getAllSubmissions())
}

export async function getTagCounts(): Promise<TagCount[]> {
  return tagCountsFrom(await getAllSubmissions())
}

export async function getNewsList(): Promise<NewsItem[]> {
  const { createSupabaseServerClient } = await import('./supabaseServer')
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb
    .from('news_posts')
    .select('id, slug, title, excerpt, content, banner_image, created_at')
    .eq('published', true)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[api] getNewsList failed', error)
    return []
  }
  return (data ?? []) as NewsItem[]
}

export async function getNewsItem(slug: string): Promise<NewsItem | null> {
  const { createSupabaseServerClient } = await import('./supabaseServer')
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb
    .from('news_posts')
    .select('id, slug, title, excerpt, content, banner_image, created_at')
    .eq('published', true)
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    console.error('[api] getNewsItem failed', error)
    return null
  }
  return (data ?? null) as NewsItem | null
}

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt?: string
  content?: string
  author_name?: string
  author_url?: string
  featured_image_url?: string
  featured_image_alt?: string
  tags?: string[]
  categories?: string[]
  source_url?: string
  published_at: string
  created_at: string
}

export async function getBlogList(): Promise<BlogPost[]> {
  const { createSupabaseServerClient } = await import('./supabaseServer')
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb
    .from('blog_posts')
    .select('id, slug, title, excerpt, author_name, featured_image_url, tags, published_at, created_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (error) {
    console.error('[api] getBlogList failed', error)
    return []
  }
  return (data ?? []) as BlogPost[]
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const { createSupabaseServerClient } = await import('./supabaseServer')
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    console.error('[api] getBlogPost failed', error)
    return null
  }
  return (data ?? null) as BlogPost | null
}

export function getPublicStorageUrl(bucket: string, path: string): string {
  const { url } = requireEnv()
  return `${url}/storage/v1/object/public/${bucket}/${path}`
}
