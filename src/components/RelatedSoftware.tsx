import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface RelatedSubmission {
  id: string
  title: string
  description: string
  logo?: string
  category: string
  tier?: string
  upvotes?: number
}

interface RelatedSoftwareProps {
  currentId: string
  category: string
  tags?: string[]
}

export function RelatedSoftware({ currentId, category, tags = [] }: RelatedSoftwareProps) {
  const [related, setRelated] = useState<RelatedSubmission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRelatedSoftware()
  }, [currentId, category, tags])

  const fetchRelatedSoftware = async () => {
    try {
      let query = supabase
        .from('software_submissions')
        .select('id, title, description, logo, category, tier, upvotes')
        .eq('status', 'approved')
        .neq('id', currentId)
        .limit(6)

      if (tags.length > 0) {
        query = query.overlaps('tags', tags)
      } else {
        query = query.eq('category', category)
      }

      const { data, error } = await query.order('upvotes', { ascending: false })

      if (error) throw error

      if (data && data.length < 3 && tags.length > 0) {
        const { data: categoryData } = await supabase
          .from('software_submissions')
          .select('id, title, description, logo, category, tier, upvotes')
          .eq('status', 'approved')
          .eq('category', category)
          .neq('id', currentId)
          .not('id', 'in', `(${data.map(d => d.id).join(',')})`)
          .order('upvotes', { ascending: false })
          .limit(6 - data.length)

        if (categoryData) {
          setRelated([...data, ...categoryData])
        } else {
          setRelated(data || [])
        }
      } else {
        setRelated(data || [])
      }
    } catch (error) {
      console.error('Error fetching related software:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-[#3a3a3a] rounded-2xl p-8">
        <h2 className="text-white text-2xl font-bold font-ubuntu mb-4">Related Software</h2>
        <div className="text-center py-8">
          <p className="text-white/70 font-ubuntu">Loading...</p>
        </div>
      </div>
    )
  }

  if (related.length === 0) {
    return null
  }

  return (
    <div className="bg-[#3a3a3a] rounded-2xl p-8 mt-6">
      <h2 className="text-white text-2xl font-bold font-ubuntu mb-6">Related Software</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {related.map((item) => (
          <Link
            key={item.id}
            to={`/software/${item.id}`}
            className="group bg-[#2a2a2a] rounded-xl p-4 hover:bg-[#404040] transition-colors"
          >
            <div className="flex items-start gap-3 mb-3">
              {item.logo ? (
                <img
                  src={supabase.storage.from('software-logos').getPublicUrl(item.logo).data.publicUrl}
                  alt={item.title}
                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-[#4FFFE3]/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[#4FFFE3] text-xl font-bold font-ubuntu">
                    {item.title.charAt(0)}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-white font-bold font-ubuntu text-sm group-hover:text-[#4FFFE3] transition-colors truncate">
                    {item.title}
                  </h3>
                  {item.tier === 'featured' && (
                    <span className="text-[#4FFFE3] text-xs">⭐</span>
                  )}
                  {item.tier === 'premium' && (
                    <span className="text-[#E0FF04] text-xs">⭐</span>
                  )}
                </div>
                <p className="text-white/60 text-xs font-ubuntu line-clamp-2">
                  {item.description}
                </p>
              </div>
            </div>
            {item.upvotes !== undefined && item.upvotes > 0 && (
              <div className="flex items-center gap-1 text-white/50 text-xs font-ubuntu">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                </svg>
                <span>{item.upvotes}</span>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
