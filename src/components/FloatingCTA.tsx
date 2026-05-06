import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

export function FloatingCTA() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY
      setIsVisible(scrollPosition > 400)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!isVisible) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Link
        to="/submit"
        className="group flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-[#4FFFE3] to-[#E0FF04] text-neutral-900 rounded-full font-ubuntu font-bold text-lg shadow-2xl hover:shadow-[0_0_30px_rgba(79,255,227,0.5)] transition-all transform hover:scale-105"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>Submit Free</span>
      </Link>
    </div>
  )
}
