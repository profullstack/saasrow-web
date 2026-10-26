'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Zap } from 'lucide-react'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { openSignIn } from '../components/EarnKarmaNudge'
import { karmaChanged, memberFetch, signOut, useMember } from '@/lib/member'

interface OwnedListing {
  id: string
  name: string
  status: string
  tier: string
}

interface Rule {
  action: string
  points: number
  label: string
  rule: string
}

export default function KarmaPage() {
  const { member, karma } = useMember()
  const [rules, setRules] = useState<Rule[]>([])
  const [listings, setListings] = useState<OwnedListing[]>([])
  const [listingId, setListingId] = useState('')
  const [name, setName] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/v1/karma')
      .then((r) => r.json())
      .then((j) => setRules(j.how_to_earn ?? []))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!member) return
    memberFetch<{ data: OwnedListing[] }>('/api/v1/listings')
      .then((j) => {
        const live = (j.data ?? []).filter((l) => l.status === 'approved')
        setListings(live)
        setListingId((id) => id || live[0]?.id || '')
      })
      .catch(() => setListings([]))
  }, [member])

  useEffect(() => {
    if (karma?.display_name) setName(karma.display_name)
  }, [karma?.display_name])

  const run = async (fn: () => Promise<string>) => {
    setBusy(true)
    setNotice(null)
    try {
      setNotice({ ok: true, text: await fn() })
      karmaChanged()
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' })
    } finally {
      setBusy(false)
    }
  }

  const redeem = () =>
    run(async () => {
      const r = await memberFetch<{ featured_until: string }>('/api/v1/me/karma/redeem', {
        method: 'POST',
        body: { listing_id: listingId },
      })
      return `Featured until ${new Date(r.featured_until).toLocaleDateString()}.`
    })

  const saveName = () =>
    run(async () => {
      await memberFetch('/api/v1/me', { method: 'PATCH', body: { display_name: name } })
      return 'Saved. The leaderboard shows this name.'
    })

  const rulesToShow = karma?.how_to_earn ?? rules

  return (
    <div className="min-h-screen bg-neutral-800">
      <div className="absolute w-full h-1/2 top-0 left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1000px] mx-auto px-4 py-12 space-y-8">
          <div className="text-center">
            <h1 className="text-white text-4xl md:text-5xl font-bold font-ubuntu mb-3">Your karma</h1>
            <p className="text-white/70 font-ubuntu">
              Points for helping other makers get found. See the{' '}
              <Link href="/leaderboard" className="text-[#4FFFE3] hover:underline">leaderboard</Link>.
            </p>
          </div>

          {!member ? (
            <section className="bg-[#3a3a3a] rounded-2xl p-8 text-center">
              <p className="text-white font-ubuntu text-lg mb-6">
                Sign in with your email to start earning. No password: we email you a code.
              </p>
              <button
                onClick={openSignIn}
                className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold"
              >
                Sign in
              </button>
            </section>
          ) : !karma ? (
            <p className="text-center text-white/70 font-ubuntu">Loading…</p>
          ) : (
            <>
              <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[#3a3a3a] rounded-2xl p-6">
                  <p className="text-white/60 font-ubuntu text-sm">All time</p>
                  <p className="text-[#4FFFE3] font-ubuntu text-4xl font-bold flex items-center gap-2">
                    <Zap className="w-7 h-7" />
                    {karma.total.toLocaleString()}
                  </p>
                </div>
                <div className="bg-[#3a3a3a] rounded-2xl p-6">
                  <p className="text-white/60 font-ubuntu text-sm">Last 7 days</p>
                  <p className="text-white font-ubuntu text-4xl font-bold">{karma.week.toLocaleString()}</p>
                </div>
                <div className="bg-[#3a3a3a] rounded-2xl p-6">
                  <p className="text-white/60 font-ubuntu text-sm">Free Featured weeks</p>
                  <p className="text-[#E0FF04] font-ubuntu text-4xl font-bold">{karma.credits.available}</p>
                </div>
              </section>

              {karma.staff && (
                <p className="text-center text-white/60 font-ubuntu text-sm">
                  This is a staff account: it earns no karma and is not ranked.
                </p>
              )}

              {karma.badges.length > 0 && (
                <section className="flex flex-wrap gap-2 justify-center">
                  {karma.badges.map((b) => (
                    <span key={b.id} className="px-4 py-2 rounded-full bg-[#3a3a3a] text-white font-ubuntu">
                      {b.emoji} {b.label}
                    </span>
                  ))}
                </section>
              )}

              <section className="bg-[#3a3a3a] rounded-2xl p-6">
                <div className="flex justify-between text-white font-ubuntu mb-2">
                  <span>Next free Featured week</span>
                  <span className="text-white/60">
                    {karma.next_credit.remaining.toLocaleString()} to go ({karma.next_credit.at.toLocaleString()})
                  </span>
                </div>
                <div className="h-3 rounded-full bg-[#2a2a2a] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#E0FF04] to-[#4FFFE3]"
                    style={{ width: `${Math.round(karma.next_credit.progress * 100)}%` }}
                  />
                </div>

                {karma.credits.available > 0 && (
                  <div className="mt-6">
                    {listings.length === 0 ? (
                      <p className="text-white/70 font-ubuntu">
                        You have a free Featured week. <Link href="/submit" className="text-[#4FFFE3] hover:underline">List a product</Link>{' '}
                        and spend it once it is approved.
                      </p>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <select
                          value={listingId}
                          onChange={(e) => setListingId(e.target.value)}
                          className="flex-1 px-4 py-3 rounded-lg bg-[#4a4a4a] text-white font-ubuntu"
                        >
                          {listings.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                              {l.tier !== 'free' ? ` (${l.tier})` : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={redeem}
                          disabled={busy || !listingId}
                          className="px-6 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold disabled:opacity-50"
                        >
                          Feature it for a week
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="bg-[#3a3a3a] rounded-2xl p-6">
                <label htmlFor="display-name" className="block text-white font-ubuntu mb-2">
                  Leaderboard name
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="display-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={`member-${karma.player.slice(0, 6)}`}
                    maxLength={40}
                    className="flex-1 px-4 py-3 rounded-lg bg-[#4a4a4a] text-white font-ubuntu"
                  />
                  <button
                    onClick={saveName}
                    disabled={busy || name.trim().length < 2}
                    className="px-6 py-3 rounded-full border-2 border-white text-white font-ubuntu disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
                <p className="text-white/50 text-sm font-ubuntu mt-2">Your email is never shown.</p>
              </section>

              {notice && (
                <p className={`text-center font-ubuntu ${notice.ok ? 'text-[#4FFFE3]' : 'text-red-400'}`}>{notice.text}</p>
              )}

              <section className="bg-[#3a3a3a] rounded-2xl p-6">
                <h2 className="text-white text-xl font-bold font-ubuntu mb-4">History</h2>
                {karma.events.length === 0 ? (
                  <p className="text-white/60 font-ubuntu">
                    Nothing yet. <Link href="/" className="text-[#4FFFE3] hover:underline">Upvote a product</Link> you use to get started.
                  </p>
                ) : (
                  <ul className="divide-y divide-white/10">
                    {karma.events.map((e, i) => (
                      <li key={i} className="flex items-center gap-4 py-2 font-ubuntu">
                        <span className={`w-14 font-bold ${e.points >= 0 ? 'text-[#E0FF04]' : 'text-red-400'}`}>
                          {e.points >= 0 ? `+${e.points}` : e.points}
                        </span>
                        <span className="flex-1 text-white">
                          {e.reversal ? `${e.label} (taken back)` : e.label}
                          {e.product?.title && (
                            <>
                              {' · '}
                              <Link href={`/software/${e.product.id}`} className="text-white/70 hover:text-[#4FFFE3]">
                                {e.product.title}
                              </Link>
                            </>
                          )}
                        </span>
                        <span className="text-white/40 text-sm">{new Date(e.at).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <p className="text-center text-white/50 font-ubuntu text-sm">
                Signed in as {member.email}.{' '}
                <button onClick={() => signOut()} className="underline hover:text-white">Sign out</button>
              </p>
            </>
          )}

          <section className="bg-[#3a3a3a] rounded-2xl p-6">
            <h2 className="text-white text-xl font-bold font-ubuntu mb-4">How to earn</h2>
            <ul className="divide-y divide-white/10">
              {rulesToShow.map((r) => (
                <li key={r.action} className="flex gap-4 py-2 font-ubuntu">
                  <span className="w-14 text-[#E0FF04] font-bold">+{r.points}</span>
                  <span className="flex-1">
                    <span className="text-white">{r.label}</span>
                    <span className="block text-white/50 text-sm">{r.rule}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  )
}
