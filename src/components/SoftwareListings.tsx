import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { SoftwareCard } from './SoftwareCard'

interface Software {
  id: string
  title: string
  url: string
  description: string
  category: string
  logo?: string
  image?: string
  tags?: string[]
  submitted_at?: string
  tier?: string
  featured?: boolean
  homepage_featured?: boolean
  upvotes?: number
  downvotes?: number
  view_count?: number
}

interface SoftwareListingsProps {
  searchQuery: string
  selectedFilter: 'all' | 'featured' | 'premium'
  activeCategories: string[]
  activeTags: string[]
  selectedSort: string
}

export function SoftwareListings({
  searchQuery,
  selectedFilter,
  activeCategories,
  activeTags,
  selectedSort,
}: SoftwareListingsProps) {
  const [listings, setListings] = useState<Software[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchListings()
  }, [])

  const fetchListings = async () => {
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submissions?t=${Date.now()}`
      console.log('Fetching from:', apiUrl)

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      })

      console.log('Response status:', response.status)

      if (response.ok) {
        const result = await response.json()
        console.log('Received data:', result)
        setListings(result.data || [])
      } else {
        const errorText = await response.text()
        console.error('Error response:', errorText)
        setError(`Failed to load software listings: ${response.status}`)
      }
    } catch (err) {
      console.error('Fetch error:', err)
      setError(`Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <section className="w-full max-w-[1318px] mx-auto px-4 py-12">
        <div className="text-center">
          <p className="text-white/70 text-xl font-ubuntu">Loading software...</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="w-full max-w-[1318px] mx-auto px-4 py-12">
        <div className="bg-[#3a3a3a] rounded-2xl p-8 text-center">
          <p className="text-red-400 text-xl font-ubuntu">{error}</p>
        </div>
      </section>
    )
  }

  const filteredAndSortedListings = listings
    .filter((software) => {
      const matchesSearch =
        searchQuery === '' ||
        software.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        software.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        software.tags?.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesCategory =
        activeCategories.length === 0 || activeCategories.includes(software.category)

      const matchesTags =
        activeTags.length === 0 ||
        (software.tags && activeTags.some((filterTag) =>
          software.tags?.some((softwareTag) =>
            softwareTag.toLowerCase() === filterTag.toLowerCase()
          )
        ))

      const matchesFilter =
        selectedFilter === 'all' ||
        (selectedFilter === 'featured' && (software.featured || software.tier === 'featured')) ||
        (selectedFilter === 'premium' && software.tier === 'premium')

      return matchesSearch && matchesCategory && matchesTags && matchesFilter
    })
    .sort((a, b) => {
      // First sort by tier (premium > featured > free)
      const tierPriority = { premium: 3, featured: 2, free: 1 }
      const aTierPriority = tierPriority[a.tier as keyof typeof tierPriority] || 1
      const bTierPriority = tierPriority[b.tier as keyof typeof tierPriority] || 1

      if (aTierPriority !== bTierPriority) {
        return bTierPriority - aTierPriority
      }

      // Then apply user-selected sort
      switch (selectedSort) {
        case 'Newest':
          return new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime()
        case 'A-Z':
          return a.title.localeCompare(b.title)
        case 'Z-A':
          return b.title.localeCompare(a.title)
        case 'Most Popular':
        case 'Top Rated':
          const aVotes = (a.upvotes || 0) - (a.downvotes || 0)
          const bVotes = (b.upvotes || 0) - (b.downvotes || 0)
          const aViews = a.view_count || 0
          const bViews = b.view_count || 0
          const aScore = aVotes * 10 + aViews
          const bScore = bVotes * 10 + bViews
          return bScore - aScore
        default:
          return 0
      }
    })

  if (listings.length === 0) {
    return (
      <section className="w-full max-w-[1318px] mx-auto px-4 py-12">
        <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
          <p className="text-white/70 text-xl font-ubuntu">No software listings available yet.</p>
          <Link
            to="/submit"
            className="inline-block mt-6 px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold text-lg hover:opacity-90 transition-opacity"
          >
            Submit Your Software
          </Link>
        </div>
      </section>
    )
  }

  if (filteredAndSortedListings.length === 0) {
    return (
      <section className="w-full max-w-[1318px] mx-auto px-4 py-12">
        <div className="bg-[#3a3a3a] rounded-2xl p-12 text-center">
          <p className="text-white/70 text-xl font-ubuntu">No software matches your filters.</p>
          <p className="text-white/50 text-sm font-ubuntu mt-2">Try adjusting your search or category filters.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="w-full max-w-[1318px] mx-auto px-4 py-12">
      <div className="mb-6">
        <p className="text-white/70 font-ubuntu">
          Showing {filteredAndSortedListings.length} of {listings.length} software listings
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAndSortedListings.map((software) => (
          <SoftwareCard key={software.id} software={software} />
        ))}
      </div>
    </section>
  )
}
