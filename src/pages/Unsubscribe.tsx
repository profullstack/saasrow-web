import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam))
    }
  }, [searchParams])

  const handleUnsubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsProcessing(true)
    setStatus('idle')
    setMessage('')

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter`
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('success')
        setMessage('You have been successfully unsubscribed from our newsletter.')
      } else {
        setStatus('error')
        setMessage(data.error || 'Failed to unsubscribe. Please try again.')
      }
    } catch (error) {
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
    } finally {
      setIsProcessing(false)
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

        <main className="w-full max-w-2xl mx-auto px-4 py-12 sm:py-24">
          <div className="bg-[#3a3a3a] rounded-2xl p-8 sm:p-12">
            <h1 className="text-white text-4xl sm:text-5xl font-bold font-ubuntu mb-4 text-center">
              Unsubscribe
            </h1>
            <p className="text-white/70 text-lg font-ubuntu mb-8 text-center">
              We're sorry to see you go. Enter your email to unsubscribe from our newsletter.
            </p>

            {status === 'idle' && (
              <form onSubmit={handleUnsubscribe} className="space-y-6">
                <div>
                  <label htmlFor="email" className="block text-white font-ubuntu mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    required
                    disabled={isProcessing}
                    className="w-full px-4 py-3 bg-[#4a4a4a] text-white rounded-lg outline-none focus:ring-2 focus:ring-[#4FFFE3] font-ubuntu disabled:opacity-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isProcessing || !email}
                  className="w-full py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Unsubscribing...' : 'Unsubscribe'}
                </button>
              </form>
            )}

            {status === 'success' && (
              <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#4FFFE3]/20 mb-4">
                  <svg className="w-8 h-8 text-[#4FFFE3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-[#4FFFE3] text-xl font-ubuntu font-bold">{message}</p>
                <p className="text-white/70 font-ubuntu">
                  You won't receive any more newsletters from us.
                </p>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-[#4d1a1a] border-2 border-red-400">
                  <p className="text-red-400 font-ubuntu text-center">{message}</p>
                </div>
                <button
                  onClick={() => {
                    setStatus('idle')
                    setMessage('')
                  }}
                  className="w-full py-3 rounded-full bg-[#4a4a4a] text-white font-ubuntu font-bold hover:bg-[#555555] transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}
