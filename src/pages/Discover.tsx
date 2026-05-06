import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

interface CategoryCount {
  name: string
  count: number
}

export default function DiscoverPage() {
  const [categories, setCategories] = useState<CategoryCount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
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

        const categoryMap = new Map<string, number>()
        submissions.forEach((sub: { category: string }) => {
          const current = categoryMap.get(sub.category) || 0
          categoryMap.set(sub.category, current + 1)
        })

        const categoryCounts = Array.from(categoryMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)

        setCategories(categoryCounts)
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error)
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

        <main className="w-full max-w-[1200px] mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <h1 className="text-white text-5xl font-bold font-ubuntu mb-4">Discover Software</h1>
            <p className="text-white/70 text-xl font-ubuntu max-w-2xl mx-auto">
              Explore curated collections and find your next favorite tool
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-white/70 font-ubuntu text-xl">Loading categories...</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-white/70 font-ubuntu text-xl">No categories available yet</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map((category) => (
                <Link
                  key={category.name}
                  to={`/category/${category.name.toLowerCase()}`}
                  className="bg-[#3a3a3a] rounded-2xl p-8 hover:bg-[#404040] transition-colors block"
                >
                  <h3 className="text-white text-2xl font-bold font-ubuntu mb-3">{category.name}</h3>
                  <p className="text-white/70 font-ubuntu text-lg">
                    {category.count} {category.count === 1 ? 'app' : 'apps'}
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
