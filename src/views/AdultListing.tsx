'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { memberFetch, useMember } from '@/lib/member'
import { ADULT_LABEL, ADULT_NOTICE, ADULT_PATH } from '@/lib/adultShared'
import { AdultSignIn, type AdultListing as Listing } from './AdultCategory'

/**
 * One Adult (18+) listing. The server renders this shell for any adult id
 * without the listing in it; the listing comes from the member API, so an
 * anonymous visitor gets the sign-in prompt and no content.
 */
export default function AdultListing({ id }: { id: string }) {
  const { member } = useMember()
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!member) {
      setListing(null)
      return
    }
    let cancelled = false
    memberFetch<{ data: Listing }>(`/api/v1/adult/${id}`)
      .then((r) => !cancelled && setListing(r.data))
      .catch((err: Error) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [member, id])

  return (
    <div className="bg-neutral-800 w-full min-h-screen relative">
      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[860px] mx-auto px-4 py-12">
          <p className="font-ubuntu text-sm mb-6">
            <Link href={ADULT_PATH} className="text-[#4FFFE3] hover:underline">
              {ADULT_LABEL}
            </Link>
          </p>

          {!member ? (
            <AdultSignIn />
          ) : error ? (
            <p className="text-red-400 font-ubuntu">{error}</p>
          ) : !listing ? (
            <p className="text-white/60 font-ubuntu">Loading…</p>
          ) : (
            <article className="bg-[#3a3a3a] rounded-2xl p-8">
              <p className="text-white/50 font-ubuntu text-sm mb-3">{ADULT_NOTICE}</p>
              <h1 className="text-white text-4xl font-bold font-ubuntu mb-4 break-words">{listing.name}</h1>
              <p className="text-white/80 font-ubuntu text-lg leading-relaxed mb-6 whitespace-pre-line">
                {listing.description}
              </p>
              {listing.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-8">
                  {listing.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1 bg-[#4FFFE3]/20 text-[#4FFFE3] rounded-full text-sm font-ubuntu">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <a
                href={listing.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-block px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold break-all"
              >
                Visit {new URL(listing.website).host}
              </a>
            </article>
          )}
        </main>

        <Footer />
      </div>
    </div>
  )
}
