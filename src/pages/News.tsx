import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { supabase } from '../lib/supabase'

interface NewsItem {
  id: string
  slug: string
  title: string
  excerpt: string
  created_at: string
  banner_image?: string
}

export default function NewsPage() {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchNewsPosts()
  }, [])

  const fetchNewsPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('news_posts')
        .select('id, slug, title, excerpt, created_at, banner_image')
        .eq('published', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      setNewsItems(data || [])
    } catch (error) {
      console.error('Failed to fetch news posts:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-800 relative">
      <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1000px] mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <h1 className="text-white text-5xl font-bold font-ubuntu mb-4">News & Updates</h1>
            <p className="text-white/70 text-xl font-ubuntu max-w-2xl mx-auto">
              Stay updated with the latest in software, tools, and technology
            </p>
          </div>

          <div className="space-y-6">
            {loading ? (
              <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
                <p className="text-white/70 font-ubuntu text-xl">Loading news posts...</p>
              </div>
            ) : newsItems.length === 0 ? (
              <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
                <p className="text-white/70 font-ubuntu text-xl">No news posts available yet</p>
              </div>
            ) : (
              newsItems.map((item) => (
                <Link
                  key={item.id}
                  to={`/news/${item.slug}`}
                  className="block bg-[#3a3a3a] rounded-2xl overflow-hidden hover:bg-[#404040] transition-colors cursor-pointer"
                >
                  <article>
                    {item.banner_image && (
                      <div className="w-full h-48 overflow-hidden">
                        <img
                          src={item.banner_image}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-8">
                      <p className="text-[#4FFFE3] font-ubuntu text-sm mb-2">
                        {new Date(item.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                      <h2 className="text-white text-3xl font-bold font-ubuntu mb-3">{item.title}</h2>
                      <p className="text-white/70 font-ubuntu text-lg">{item.excerpt}</p>
                      <div className="mt-4 flex items-center gap-2 text-[#4FFFE3] font-ubuntu">
                        <span>Read more</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </article>
                </Link>
              ))
            )}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}
