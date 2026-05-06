import { useState, FormEvent, ChangeEvent } from 'react'
import { Link } from 'react-router-dom'

export function Footer() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const navigationLinks = [
    { label: 'About us', href: '/about' },
    { label: 'Discover', href: '/discover' },
    { label: 'News', href: '/news' },
  ]

  const footerLinks = [
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Unsubscribe', href: '/unsubscribe' },
  ]

  const handleSubscribe = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: data.message || 'Successfully subscribed! Check your email for your discount code.' })
        setEmail('')
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to subscribe' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Something went wrong. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <footer className="w-full max-w-[1280px] mx-auto px-4 py-8 sm:py-12 mt-12 sm:mt-24">
      <div className="space-y-6 sm:space-y-8">
        <section className="bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] rounded-2xl sm:rounded-3xl p-6 sm:p-12">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6 sm:gap-8">
            <div className="flex-1 text-center lg:text-left">
              <h2 className="font-ubuntu font-bold text-black text-3xl sm:text-4xl lg:text-5xl mb-3 sm:mb-4">
                Subscribe Newsletter
              </h2>
              <p className="font-ubuntu text-black text-base sm:text-lg lg:text-xl max-w-md mx-auto lg:mx-0 mb-2">
                For the latest in self-hosted news, software, and content delivered straight to your
                inbox every Friday
              </p>
              <p className="font-ubuntu font-bold text-black text-sm sm:text-base">
                🎁 Get a free 50% discount code when you subscribe!
              </p>
            </div>

            <form onSubmit={handleSubscribe} className="w-full flex-1 max-w-xl">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center bg-neutral-800 rounded-2xl sm:rounded-full px-4 sm:px-6 py-3 gap-3 sm:gap-0">
                <input
                  type="email"
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  disabled={isSubmitting}
                  className="flex-1 bg-transparent text-white font-ubuntu text-base sm:text-lg outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="sm:ml-4 px-6 sm:px-8 py-2 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Subscribing...' : 'Subscribe Now'}
                </button>
              </div>
              {message && (
                <div className={`mt-3 p-4 rounded-lg font-ubuntu text-sm ${
                  message.type === 'success'
                    ? 'bg-[#1a4d45] border-2 border-[#4FFFE3] text-[#4FFFE3]'
                    : 'bg-[#4d1a1a] border-2 border-red-400 text-red-400'
                }`}>
                  <p className="font-semibold mb-1">
                    {message.type === 'success' ? '✓ Success!' : '✗ Error'}
                  </p>
                  <p>{message.text}</p>
                </div>
              )}
            </form>
          </div>
        </section>

        <nav className="flex items-center justify-center gap-6 sm:gap-12 py-4 sm:py-6 flex-wrap">
          {navigationLinks.map((link) => (
            <Link
              key={link.label}
              to={link.href}
              className="font-ubuntu text-white text-base sm:text-lg hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-center gap-6">
          <a
            href="https://x.com/profullstackinc"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-[#4FFFE3] transition-colors"
            aria-label="Follow us on X (Twitter)"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            href="https://github.com/ralyodio/saasrow-web"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-[#4FFFE3] transition-colors"
            aria-label="View our GitHub repository"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
          </a>
          <a
            href="https://discord.gg/w5nHdzpQ29"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-[#4FFFE3] transition-colors"
            aria-label="Join our Discord community"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>
        </div>

        <hr className="border-white/20" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-white/75 font-ubuntu text-xs sm:text-sm">
          <p className="text-center md:text-left">© 2025 <a href="https://profullstack.com" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-white transition-colors">Profullstack, Inc.</a> All rights reserved.</p>

          <Link to="/" className="order-first md:order-none">
            <img className="h-8 sm:h-10 w-auto" alt="SaaSRow logo" src="/wiresniff-logo-1-1.png" />
          </Link>

          <nav className="flex gap-4 sm:gap-8 flex-wrap justify-center">
            {footerLinks.map((link) => (
              <Link key={link.label} to={link.href} className="hover:underline">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}
