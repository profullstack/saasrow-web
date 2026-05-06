import { useEffect, useState } from 'react'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import type { CommunityPost } from '../lib/supabase'
import { trackEvent, analyticsEvents } from '../lib/analytics'

export default function CommunityPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPosts()
  }, [])

  const fetchPosts = async () => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/community`
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      })
      const result = await response.json()

      if (response.ok) {
        setPosts(result.data || [])
      } else {
        setError(result.error || 'Failed to load posts')
      }
    } catch (err) {
      setError('Failed to load posts')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLike = async (postId: string, currentLikes: number) => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/community`
      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: postId,
          likes: currentLikes + 1,
        }),
      })

      if (response.ok) {
        trackEvent(analyticsEvents.COMMUNITY_POST_CREATED, {
          post_id: postId,
        });
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId ? { ...post, likes: currentLikes + 1 } : post
          )
        )
      }
    } catch (err) {
      console.error('Failed to like post:', err)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-800">
      <div className="absolute w-full h-1/2 top-0 left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1200px] mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <h1 className="text-white text-5xl font-bold font-ubuntu mb-4">Community</h1>
            <p className="text-white/70 text-xl font-ubuntu max-w-2xl mx-auto">
              Connect with other developers, share your experiences, and learn from the community
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-white font-ubuntu text-xl">Loading posts...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400 font-ubuntu text-xl">{error}</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-white/70 font-ubuntu text-xl">No posts yet. Be the first to post!</p>
            </div>
          ) : (
            <div className="grid gap-6 mb-8">
              {posts.map((post) => (
                <article
                  key={post.id}
                  className="bg-[#3a3a3a] rounded-2xl p-8 hover:bg-[#404040] transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#E0FF04] to-[#4FFFE3] flex-shrink-0" />

                    <div className="flex-1">
                      <h3 className="text-white font-bold font-ubuntu text-sm mb-1">
                        {post.author}
                      </h3>
                      <h2 className="text-white text-2xl font-bold font-ubuntu mb-2">
                        {post.title}
                      </h2>
                      <p className="text-white/70 font-ubuntu mb-4">{post.excerpt}</p>

                      <div className="flex items-center gap-6 text-white/50 font-ubuntu text-sm">
                        <button
                          onClick={() => handleLike(post.id, post.likes)}
                          className="flex items-center gap-2 hover:text-[#4FFFE3] transition-colors"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                          </svg>
                          {post.likes}
                        </button>

                        <button className="flex items-center gap-2 hover:text-[#4FFFE3] transition-colors">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {post.comments}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="text-center">
            <button className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity">
              Load More Posts
            </button>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}
