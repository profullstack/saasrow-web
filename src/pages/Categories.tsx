import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

interface CategoryCount {
  name: string
  count: number
}

export default function CategoriesPage() {
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

  const getGradientColor = (index: number) => {
    return index % 2 === 0 ? 'from-[#E0FF04] to-[#4FFFE3]' : 'from-[#4FFFE3] to-[#E0FF04]'
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
            <h1 className="text-white text-5xl font-bold font-ubuntu mb-4">Browse by Categories</h1>
            <p className="text-white/70 text-xl font-ubuntu max-w-2xl mx-auto">
              Explore software by category and find exactly what you need
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map((category, index) => (
                <Link
                  key={category.name}
                  to={`/category/${category.name.toLowerCase()}`}
                  className="group bg-[#3a3a3a] rounded-2xl p-8 hover:bg-[#404040] transition-all hover:scale-105 block"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white text-2xl font-bold font-ubuntu">{category.name}</h3>
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getGradientColor(index)} flex items-center justify-center`}>
                      <svg className="w-6 h-6 text-neutral-800" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M7 2a1 1 0 011 1v1h3a1 1 0 110 2H9.578a18.87 18.87 0 01-1.724 4.78c.29.354.596.696.914 1.026a1 1 0 11-1.44 1.389c-.188-.196-.373-.396-.554-.6a19.098 19.098 0 01-3.107 3.567 1 1 0 01-1.334-1.49 17.087 17.087 0 003.13-3.733 18.992 18.992 0 01-1.487-2.494 1 1 0 111.79-.89c.234.47.489.928.764 1.372.417-.934.752-1.913.997-2.927H3a1 1 0 110-2h3V3a1 1 0 011-1zm6 6a1 1 0 01.894.553l2.991 5.982a.869.869 0 01.02.037l.99 1.98a1 1 0 11-1.79.895L15.383 16h-4.764l-.724 1.447a1 1 0 11-1.788-.894l.99-1.98.019-.038 2.99-5.982A1 1 0 0113 8zm-1.382 6h2.764L13 11.236 11.618 14z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
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
