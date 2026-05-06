import { useState, useEffect } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { supabase } from '../lib/supabase'

interface NewsPost {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  created_at: string
  banner_image?: string
}

export default function NewsPostPage() {
  const { id } = useParams<{ id: string }>()
  const [post, setPost] = useState<NewsPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (id) {
      fetchPost(id)
    }
  }, [id])

  const fetchPost = async (slug: string) => {
    try {
      const { data, error } = await supabase
        .from('news_posts')
        .select('*')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        setNotFound(true)
      } else {
        setPost(data)
      }
    } catch (error) {
      console.error('Failed to fetch post:', error)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-800 relative">
        <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
          <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
          <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        </div>

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

  if (notFound || !post) {
    return <Navigate to="/news" replace />
  }

  return (
    <div className="min-h-screen bg-neutral-800 relative">
      <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[800px] mx-auto px-4 py-12">
          <Link
            to="/news"
            className="inline-flex items-center gap-2 text-[#4FFFE3] font-ubuntu mb-8 hover:underline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to News
          </Link>

          <article className="bg-[#3a3a3a] rounded-2xl overflow-hidden">
            {post.banner_image && (
              <div className="w-full h-64 md:h-96 overflow-hidden">
                <img
                  src={post.banner_image}
                  alt={post.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="p-8 md:p-12">
              <p className="text-[#4FFFE3] font-ubuntu text-sm mb-4">
                {new Date(post.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <h1 className="text-white text-4xl md:text-5xl font-bold font-ubuntu mb-8">
                {post.title}
              </h1>

              <div
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: post.content }}
                style={{
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontFamily: 'Ubuntu, sans-serif',
                  fontSize: '1.125rem',
                  lineHeight: '1.75'
                }}
              />
            </div>
          </article>
        </main>

        <Footer />
      </div>

      <style>{`
        .prose h2 {
          color: white;
          font-size: 1.875rem;
          font-weight: bold;
          margin-top: 2rem;
          margin-bottom: 1rem;
          font-family: Ubuntu, sans-serif;
        }

        .prose p {
          margin-bottom: 1.5rem;
        }

        .prose ul {
          margin-top: 1rem;
          margin-bottom: 1.5rem;
          padding-left: 1.5rem;
          list-style-type: disc;
        }

        .prose li {
          margin-bottom: 0.5rem;
          color: rgba(255, 255, 255, 0.7);
        }
      `}</style>
    </div>
  )
}
