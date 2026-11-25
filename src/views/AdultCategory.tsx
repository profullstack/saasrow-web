'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { openSignIn } from '../components/EarnKarmaNudge'
import { memberFetch, useMember } from '@/lib/member'
import { ADULT_LABEL, ADULT_NOTICE } from '@/lib/adultShared'

export interface AdultListing {
  id: string
  name: string
  description: string
  website: string
  tags: string[]
  logo_url: string | null
  upvotes: number
}

interface AdultPage {
  data: AdultListing[]
  pagination: { total: number; next: number | null }
}

/** What an anonymous visitor sees on any adult page: a reason and a sign-in button, nothing else. */
export function AdultSignIn() {
  return (
    <section className="bg-[#3a3a3a] rounded-2xl p-8 text-center">
      <p className="text-white font-ubuntu text-lg mb-2">The {ADULT_LABEL} category is for signed-in members.</p>
      <p className="text-white/60 font-ubuntu mb-6">{ADULT_NOTICE} Sign in with your email to view it.</p>
      <button
        onClick={openSignIn}
        className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold"
      >
        Sign in
      </button>
    </section>
  )
}

export default function AdultCategory() {
  const { member } = useMember()
  const [listings, setListings] = useState<AdultListing[] | null>(null)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!member) {
      setListings(null)
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      memberFetch<AdultPage>(`/api/v1/adult?limit=100${query ? `&q=${encodeURIComponent(query)}` : ''}`)
        .then((page) => {
          if (cancelled) return
          setListings(page.data)
          setTotal(page.pagination.total)
          setError(null)
        })
        .catch((err: Error) => !cancelled && setError(err.message))
    }, query ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [member, query])

  return (
    <div className="bg-neutral-800 w-full min-h-screen relative">
      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1200px] mx-auto px-4 py-12">
          <div className="text-center mb-10">
            <h1 className="text-white text-5xl font-bold font-ubuntu mb-4">{ADULT_LABEL}</h1>
            <p className="text-white/70 text-lg font-ubuntu max-w-2xl mx-auto">{ADULT_NOTICE}</p>
          </div>

          {!member ? (
            <AdultSignIn />
          ) : (
            <>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search this category"
                aria-label="Search the Adult category"
                className="w-full mb-8 px-5 py-3 rounded-full bg-[#3a3a3a] text-white font-ubuntu placeholder-white/40 border border-white/10 focus:outline-none focus:border-[#4FFFE3]"
              />

              {error ? (
                <p className="text-red-400 font-ubuntu text-center">{error}</p>
              ) : listings === null ? (
                <p className="text-white/60 font-ubuntu text-center">Loading…</p>
              ) : listings.length === 0 ? (
                <p className="text-white/60 font-ubuntu text-center">
                  {query ? 'Nothing matches that search.' : 'Nothing listed here yet.'}{' '}
                  <Link href="/submit" className="text-[#4FFFE3] hover:underline">Submit a site</Link>.
                </p>
              ) : (
                <>
                  <p className="text-white/50 font-ubuntu text-sm mb-4">
                    {total} listing{total === 1 ? '' : 's'}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {listings.map((l) => (
                      <Link
                        key={l.id}
                        href={`/software/${l.id}`}
                        className="bg-[#3a3a3a] rounded-2xl p-6 hover:bg-[#444] transition-colors block"
                      >
                        <h2 className="text-white text-xl font-bold font-ubuntu mb-2 break-words">{l.name}</h2>
                        <p className="text-white/70 font-ubuntu text-sm mb-4 line-clamp-3">{l.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {l.tags.slice(0, 5).map((tag) => (
                            <span key={tag} className="px-2 py-1 bg-[#4FFFE3]/20 text-[#4FFFE3] rounded-full text-xs font-ubuntu">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </main>

        <Footer />
      </div>
    </div>
  )
}
