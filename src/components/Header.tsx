import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Menu, X, Heart } from 'lucide-react'

interface HeaderProps {
  isManagementPage?: boolean
}

export function Header({ isManagementPage = false }: HeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [activeNav, setActiveNav] = useState('apps')
  const [showSignIn, setShowSignIn] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [bookmarkCount, setBookmarkCount] = useState(0)

  useEffect(() => {
    updateBookmarkCount()
    window.addEventListener('storage', updateBookmarkCount)
    return () => window.removeEventListener('storage', updateBookmarkCount)
  }, [])

  const updateBookmarkCount = () => {
    try {
      const bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]')
      setBookmarkCount(bookmarks.length)
    } catch {
      setBookmarkCount(0)
    }
  }

  const handleLogout = () => {
    navigate('/')
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-management-link`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: 'Check your email for the management link!' })
        setEmail('')

        if (data.managementUrl) {
          const localUrl = data.managementUrl.replace(/^https?:\/\/[^\/]+/, window.location.origin)
          setTimeout(() => {
            window.location.href = localUrl
          }, 2000)
        } else {
          setTimeout(() => {
            setShowSignIn(false)
            setMessage(null)
          }, 3000)
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send link' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Something went wrong. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const navigationItems = [
    { id: 'apps', label: 'Apps', href: '/' },
    { id: 'categories', label: 'Categories', href: '/categories' },
    { id: 'tags', label: 'Tags', href: '/tags' },
  ]

  return (
    <header className="w-full max-w-[1335px] mx-auto px-4 py-6 md:py-9">
      <div className="flex items-center justify-between">
        <Link to="/" onClick={() => setMobileMenuOpen(false)}>
          <img
            className="h-12 md:h-16 w-auto object-contain"
            alt="SaaSRow logo"
            src="/wiresniff-logo-1-1.png"
          />
        </Link>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden text-white p-2"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>

        <nav className="hidden lg:flex items-center gap-8">
          {navigationItems.map((item) => (
            <Link
              key={item.id}
              to={item.href}
              onClick={() => setActiveNav(item.id)}
              className={`font-roboto text-2xl transition-all ${
                activeNav === item.id
                  ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] bg-clip-text text-transparent'
                  : 'text-white hover:opacity-80'
              }`}
            >
              {item.label}
            </Link>
          ))}

          <Link
            to="/favorites"
            className="text-white hover:opacity-80 transition-opacity flex items-center gap-2 relative"
            title="My Favorites"
          >
            <Heart className="w-6 h-6" />
            {bookmarkCount > 0 && (
              <span className="text-lg font-roboto font-bold">
                {bookmarkCount}
              </span>
            )}
          </Link>

          <Link
            to="/featured"
            className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-roboto text-xl hover:opacity-90 transition-opacity"
          >
            Get Featured
          </Link>

          {isManagementPage ? (
            <button
              onClick={handleLogout}
              className="px-6 py-3 rounded-full border-2 border-white text-white font-roboto text-xl hover:bg-white hover:text-neutral-800 transition-all"
            >
              Logout
            </button>
          ) : (
            <button
              onClick={() => setShowSignIn(true)}
              className="px-6 py-3 rounded-full border-2 border-white text-white font-roboto text-xl hover:bg-white hover:text-neutral-800 transition-all"
            >
              Sign In
            </button>
          )}
        </nav>
      </div>

      {mobileMenuOpen && (
        <nav className="lg:hidden mt-6 pb-4 border-t border-white/10 pt-4 space-y-4">
          {navigationItems.map((item) => (
            <Link
              key={item.id}
              to={item.href}
              onClick={() => {
                setActiveNav(item.id)
                setMobileMenuOpen(false)
              }}
              className={`block font-roboto text-xl transition-all ${
                activeNav === item.id
                  ? 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] bg-clip-text text-transparent'
                  : 'text-white hover:opacity-80'
              }`}
            >
              {item.label}
            </Link>
          ))}

          <Link
            to="/favorites"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full text-center px-6 py-3 rounded-full border-2 border-white/50 text-white font-roboto text-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
          >
            <Heart className="w-5 h-5" />
            <span>My Favorites</span>
            {bookmarkCount > 0 && (
              <span className="ml-1 font-bold">({bookmarkCount})</span>
            )}
          </Link>

          <Link
            to="/featured"
            onClick={() => setMobileMenuOpen(false)}
            className="block w-full text-center px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-roboto text-xl hover:opacity-90 transition-opacity"
          >
            Get Featured
          </Link>

          {isManagementPage ? (
            <button
              onClick={() => {
                handleLogout()
                setMobileMenuOpen(false)
              }}
              className="block w-full px-6 py-3 rounded-full border-2 border-white text-white font-roboto text-xl hover:bg-white hover:text-neutral-800 transition-all"
            >
              Logout
            </button>
          ) : (
            <button
              onClick={() => {
                setShowSignIn(true)
                setMobileMenuOpen(false)
              }}
              className="block w-full px-6 py-3 rounded-full border-2 border-white text-white font-roboto text-xl hover:bg-white hover:text-neutral-800 transition-all"
            >
              Sign In
            </button>
          )}
        </nav>
      )}

      {showSignIn && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSignIn(false)}>
          <div className="bg-neutral-800 rounded-2xl p-8 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-white text-2xl font-bold font-ubuntu">Sign In</h2>
              <button
                onClick={() => setShowSignIn(false)}
                className="text-white hover:text-gray-300 text-2xl"
              >
                ×
              </button>
            </div>

            <p className="text-white/70 mb-6 font-ubuntu">
              Enter your email to receive a link to manage your listings
            </p>

            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label htmlFor="signin-email" className="block text-white font-ubuntu mb-2">
                  Email Address
                </label>
                <input
                  id="signin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu"
                />
              </div>

              {message && (
                <div
                  className={`rounded-lg p-3 ${
                    message.type === 'success'
                      ? 'bg-[#1a4d45] border-2 border-[#4FFFE3]'
                      : 'bg-[#4d1a1a] border-2 border-red-400'
                  }`}
                >
                  <p
                    className={`text-sm font-ubuntu ${
                      message.type === 'success' ? 'text-[#4FFFE3]' : 'text-red-400'
                    }`}
                  >
                    {message.text}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSubmitting ? 'Sending...' : 'Send Magic Link'}
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  )
}
