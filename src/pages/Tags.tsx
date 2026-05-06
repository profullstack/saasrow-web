import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { SoftwareCard } from '../components/SoftwareCard'

interface TagCount {
  name: string
  count: number
}

interface Submission {
  id: string
  title: string
  description: string
  url: string
  logo?: string
  image?: string
  category: string
  tags: string[]
  upvotes?: number
  downvotes?: number
  view_count?: number
  tier?: string
  created_at?: string
}

export default function TagsPage() {
  const { tag } = useParams()
  const [tags, setTags] = useState<TagCount[]>([])
  const [software, setSoftware] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('popularity')

  useEffect(() => {
    if (tag) {
      fetchSoftwareByTag(tag)
    } else {
      fetchTags()
    }
  }, [tag])

  const fetchTags = async () => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submissions`
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      })

      if (response.ok) {
        const result = await response.json()
        const submissions = result.data || []

        const tagMap = new Map<string, number>()
        submissions.forEach((sub: Submission) => {
          if (sub.tags && Array.isArray(sub.tags)) {
            sub.tags.forEach((t: string) => {
              const current = tagMap.get(t) || 0
              tagMap.set(t, current + 1)
            })
          }
        })

        const tagCounts = Array.from(tagMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)

        setTags(tagCounts)
      }
    } catch (error) {
      console.error('Failed to fetch tags:', error)
    } finally {
      setLoading(false)
    }
  }

  const sortSubmissions = (data: Submission[], sort: string) => {
    return [...data].sort((a, b) => {
      const tierPriority = { premium: 3, featured: 2, free: 1 }
      const aTierPriority = tierPriority[a.tier as keyof typeof tierPriority] || 1
      const bTierPriority = tierPriority[b.tier as keyof typeof tierPriority] || 1

      if (aTierPriority !== bTierPriority) {
        return bTierPriority - aTierPriority
      }

      switch (sort) {
        case 'popularity':
        case 'top-rated':
          const aVotes = (a.upvotes || 0) - (a.downvotes || 0)
          const bVotes = (b.upvotes || 0) - (b.downvotes || 0)
          const aViews = a.view_count || 0
          const bViews = b.view_count || 0
          const aScore = aVotes * 10 + aViews
          const bScore = bVotes * 10 + bViews
          return bScore - aScore
        case 'newest':
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        case 'name-asc':
          return a.title.localeCompare(b.title)
        case 'name-desc':
          return b.title.localeCompare(a.title)
        default:
          return 0
      }
    })
  }

  useEffect(() => {
    if (software.length > 0) {
      setSoftware(sortSubmissions(software, sortBy))
    }
  }, [sortBy])

  const fetchSoftwareByTag = async (tagName: string) => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submissions`
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      })

      if (response.ok) {
        const result = await response.json()
        const submissions = result.data || []

        const filtered = submissions.filter((sub: Submission) =>
          sub.tags && Array.isArray(sub.tags) &&
          sub.tags.some(t => t.toLowerCase() === tagName.toLowerCase())
        )

        setSoftware(sortSubmissions(filtered, sortBy))
      }
    } catch (error) {
      console.error('Failed to fetch software:', error)
    } finally {
      setLoading(false)
    }
  }

  const getGradientColor = (index: number) => {
    return index % 2 === 0 ? 'from-[#E0FF04] to-[#4FFFE3]' : 'from-[#4FFFE3] to-[#E0FF04]'
  }

  if (tag) {
    return (
      <div className="min-h-screen bg-neutral-800 relative">
        <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
          <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
          <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
          <div className="absolute w-4/5 h-40 top-1/2 left-[3.22%] bg-[#e0ff044c] rotate-[37.69deg] blur-[150px]" />
          <div className="absolute w-4/5 h-40 bottom-0 left-[-3.60%] bg-[#e0ff044c] rotate-[37.69deg] blur-[150px]" />
        </div>

        <div className="relative z-10">
          <Header />

          <main className="w-full max-w-[1200px] mx-auto px-4 py-12">
            <div className="text-center mb-12">
              <Link to="/tags" className="inline-block mb-4 text-[#4FFFE3] hover:underline font-ubuntu">
                ← Back to all tags
              </Link>
              <h1 className="text-white text-5xl font-bold font-ubuntu mb-4 capitalize">{tag}</h1>
              <p className="text-white/70 text-xl font-ubuntu max-w-2xl mx-auto">
                {software.length} {software.length === 1 ? 'app' : 'apps'} tagged with "{tag}"
              </p>
            </div>

            {!loading && software.length > 0 && (
              <div className="flex justify-end mb-6">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-4 py-2 bg-[#3a3a3a] text-white rounded-lg font-ubuntu border border-white/10 focus:outline-none focus:border-[#4FFFE3]"
                >
                  <option value="popularity">Most Popular</option>
                  <option value="top-rated">Top Rated</option>
                  <option value="newest">Newest</option>
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                </select>
              </div>
            )}

            {loading ? (
              <div className="text-center py-12">
                <p className="text-white/70 font-ubuntu text-xl">Loading software...</p>
              </div>
            ) : software.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/70 font-ubuntu text-xl">No software found with this tag</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {software.map((app) => (
                  <SoftwareCard key={app.id} software={app} />
                ))}
              </div>
            )}
          </main>

          <Footer />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-800 relative">
      <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/2 left-[3.22%] bg-[#e0ff044c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 bottom-0 left-[-3.60%] bg-[#e0ff044c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1200px] mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <h1 className="text-white text-5xl font-bold font-ubuntu mb-4">Browse by Tags</h1>
            <p className="text-white/70 text-xl font-ubuntu max-w-2xl mx-auto">
              Explore software by tags and find exactly what you need
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-white/70 font-ubuntu text-xl">Loading tags...</p>
            </div>
          ) : tags.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-white/70 font-ubuntu text-xl">No tags available yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tags.map((tagItem, index) => (
                <Link
                  key={tagItem.name}
                  to={`/tags/${tagItem.name.toLowerCase()}`}
                  className="group bg-[#3a3a3a] rounded-2xl p-8 hover:bg-[#404040] transition-all hover:scale-105 block"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white text-2xl font-bold font-ubuntu capitalize">{tagItem.name}</h3>
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getGradientColor(index)} flex items-center justify-center`}>
                      <svg className="w-6 h-6 text-neutral-800" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                  <p className="text-white/70 font-ubuntu text-lg">
                    {tagItem.count} {tagItem.count === 1 ? 'app' : 'apps'}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </main>

        <Footer />
      </div>
    </div>
  )
}
