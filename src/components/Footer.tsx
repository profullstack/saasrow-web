'use client'

import { useState, FormEvent, ChangeEvent } from 'react'
import Link from 'next/link'
import { callFn } from '@/lib/clientApi'
import { useFooterBottom } from './FooterBottom'

export function Footer() {
  const bottom = useFooterBottom()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubscribe = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      const response = await callFn('newsletter', { method: 'POST', body: { email } })

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
    <footer className="w-full max-w-[1280px] mx-auto px-4 py-6 mt-12 sm:mt-16 border-t border-white/10 font-ubuntu text-sm text-white/70">
      <form
        onSubmit={handleSubscribe}
        className="flex flex-col sm:flex-row items-center justify-center gap-3"
      >
        <label htmlFor="footer-newsletter" className="text-white">
          Friday newsletter, 50% off code on signup:
        </label>
        <div className="flex items-center gap-2">
          <input
            id="footer-newsletter"
            type="email"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={isSubmitting}
            className="w-56 bg-neutral-800 text-white rounded-full px-4 py-1.5 outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-1.5 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Subscribing...' : 'Subscribe'}
          </button>
        </div>
      </form>
      {message && (
        <p
          role="status"
          className={`mt-2 text-center ${message.type === 'success' ? 'text-[#4FFFE3]' : 'text-red-400'}`}
        >
          {message.text}
        </p>
      )}

      {/* Links, copyright and the Profullstack ring: @profullstack/footer (see FooterBottom) */}
      <div className="mt-2">{bottom}</div>
    </footer>
  )
}
