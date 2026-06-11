'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { sanitizeHtml } from '../lib/sanitize'

interface BlogPost {
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

interface BlogPostPageProps {
  initialPost?: BlogPost | null
}

export default function BlogPostPage({ initialPost }: BlogPostPageProps = {}) {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug
  const router = useRouter()
  const [post, setPost] = useState<BlogPost | null>(initialPost ?? null)
  const [loading, setLoading] = useState(initialPost === undefined)
  const [notFound, setNotFound] = useState(initialPost === null)

  useEffect(() => {
    if (initialPost !== undefined) return
    if (slug) fetchPost(slug)
  }, [slug, initialPost])

  useEffect(() => {
    if (notFound) router.replace('/blog')
  }, [notFound, router])

  const fetchPost = async (s: string) => {
    try {
      const res = await fetch(`/api/blog?slug=${encodeURIComponent(s)}`)
      const json = await res.json()
      const data = json.data as BlogPost | null
      if (!data) setNotFound(true)
      else setPost(data)
    } catch (err) {
      console.error('Failed to fetch blog post:', err)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  const bg = (
    <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
      <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
    </div>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-800 relative">
        {bg}
        <div className="relative z-10">
          <Header />
          <main className="w-full max-w-[800px] mx-auto px-4 py-12">
            <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
              <p className="text-white/70 font-ubuntu text-xl">Loading...</p>
            </div>
          </main>
          <Footer />
        </div>
      </div>
    )
  }

  if (notFound || !post) return null

  return (
    <div className="min-h-screen bg-neutral-800 relative">
      {bg}

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[800px] mx-auto px-4 py-12">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-[#4FFFE3] font-ubuntu mb-8 hover:underline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Blog
          </Link>

          <article className="bg-[#3a3a3a] rounded-2xl overflow-hidden">
            {post.featured_image_url && (
              <div className="w-full h-64 md:h-96 overflow-hidden">
                <img
                  src={post.featured_image_url}
                  alt={post.featured_image_alt || post.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="p-8 md:p-12">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <p className="text-[#4FFFE3] font-ubuntu text-sm">
                  {new Date(post.published_at || post.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                {post.author_name && (
                  post.author_url ? (
                    <a
                      href={post.author_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/50 font-ubuntu text-sm hover:text-white/80 transition-colors"
                    >
                      · {post.author_name}
                    </a>
                  ) : (
                    <span className="text-white/50 font-ubuntu text-sm">· {post.author_name}</span>
                  )
                )}
              </div>

              <h1 className="text-white text-4xl md:text-5xl font-bold font-ubuntu mb-4">
                {post.title}
              </h1>

              {post.excerpt && (
                <p className="text-white/60 font-ubuntu text-lg mb-6 leading-relaxed">{post.excerpt}</p>
              )}

              {(post.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2 mb-8">
                  {post.tags!.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 rounded-full bg-white/10 text-white/60 font-ubuntu text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content ?? '') }}
                style={{
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontFamily: 'Ubuntu, sans-serif',
                  fontSize: '1.125rem',
                  lineHeight: '1.75',
                }}
              />

              {post.source_url && (
                <div className="mt-10 pt-6 border-t border-white/10">
                  <a
                    href={post.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#4FFFE3] font-ubuntu text-sm hover:underline"
                  >
                    View original post →
                  </a>
                </div>
              )}
            </div>
          </article>
        </main>

        <Footer />
      </div>

      <style>{`
        .prose h2 { color: white; font-size: 1.875rem; font-weight: bold; margin-top: 2rem; margin-bottom: 1rem; font-family: Ubuntu, sans-serif; }
        .prose h3 { color: white; font-size: 1.5rem; font-weight: bold; margin-top: 1.5rem; margin-bottom: 0.75rem; font-family: Ubuntu, sans-serif; }
        .prose p { margin-bottom: 1.5rem; }
        .prose ul { margin-top: 1rem; margin-bottom: 1.5rem; padding-left: 1.5rem; list-style-type: disc; }
        .prose ol { margin-top: 1rem; margin-bottom: 1.5rem; padding-left: 1.5rem; list-style-type: decimal; }
        .prose li { margin-bottom: 0.5rem; color: rgba(255,255,255,0.7); }
        .prose a { color: #4FFFE3; text-decoration: underline; }
        .prose blockquote { border-left: 3px solid #4FFFE3; padding-left: 1rem; color: rgba(255,255,255,0.6); font-style: italic; margin: 1.5rem 0; }
        .prose code { background: rgba(255,255,255,0.1); padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.9em; }
        .prose pre { background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px; overflow-x: auto; margin-bottom: 1.5rem; }
      `}</style>
    </div>
  )
}
