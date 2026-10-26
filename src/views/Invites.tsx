'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Gift } from 'lucide-react'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { openSignIn } from '../components/EarnKarmaNudge'
import { RedeemCodePanel } from '../components/RedeemCodePanel'
import { memberFetch, useMember } from '@/lib/member'

interface InviteRow {
  id: string
  note: string
  created_at: string
  expires_at: string | null
  status: 'unused' | 'expired' | 'revoked' | 'accepted'
  bonus: 'paid' | 'pending' | 'withheld' | null
}

interface Overview {
  quota: { total: number; used: number; left: number }
  can_send: boolean
  can_send_reason: string | null
  bonus_days: number
  invites: InviteRow[]
  affiliate_link: string
  premium: { premium: boolean; lifetime: boolean; premium_until: string | null } | null
}

const STATUS_TEXT: Record<InviteRow['status'], string> = {
  unused: 'Not used yet',
  expired: 'Expired',
  revoked: 'Withdrawn',
  accepted: 'Accepted',
}

const BONUS_TEXT: Record<NonNullable<InviteRow['bonus']>, string> = {
  paid: 'Premium days paid to you both',
  pending: 'Bonus pending checks',
  withheld: 'No bonus on this one',
}

export default function InvitesPage() {
  const { member } = useMember()
  const [data, setData] = useState<Overview | null>(null)
  const [note, setNote] = useState('')
  const [fresh, setFresh] = useState<{ url: string; code: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    memberFetch<Overview>('/api/v1/me/invites')
      .then(setData)
      .catch((e) => setNotice({ ok: false, text: e instanceof Error ? e.message : 'Could not load invites' }))
  }, [])

  useEffect(() => {
    if (member) load()
  }, [member, load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const r = await memberFetch<{ url: string; code: string }>('/api/v1/me/invites', {
        method: 'POST',
        body: { note: note.trim() },
      })
      setFresh({ url: r.url, code: r.code })
      setNote('')
      load()
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Could not create an invite' })
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async (id: string) => {
    setNotice(null)
    try {
      await memberFetch(`/api/v1/me/invites/${encodeURIComponent(id)}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Could not withdraw it' })
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // Clipboard blocked: the text is selectable.
    }
  }

  return (
    <div className="min-h-screen bg-neutral-800">
      <div className="absolute w-full h-1/2 top-0 left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[860px] mx-auto px-4 py-12 space-y-8">
          <div className="text-center">
            <h1 className="text-white text-4xl md:text-5xl font-bold font-ubuntu mb-3 flex items-center justify-center gap-3">
              <Gift className="w-9 h-9 text-[#E0FF04]" />
              Invites
            </h1>
            <p className="text-white/70 font-ubuntu">
              Every member gets {data?.quota.total ?? 3} invites. When someone joins on yours, you both get{' '}
              {data?.bonus_days ?? 7} days of Premium.
            </p>
          </div>

          {!member ? (
            <section className="bg-[#3a3a3a] rounded-2xl p-8 text-center">
              <p className="text-white font-ubuntu text-lg mb-6">Sign in with your email to see your invites.</p>
              <button
                onClick={openSignIn}
                className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold"
              >
                Sign in
              </button>
            </section>
          ) : !data ? (
            <p className="text-center text-white/70 font-ubuntu">{notice?.text ?? 'Loading…'}</p>
          ) : (
            <>
              <section className="bg-[#3a3a3a] rounded-2xl p-6">
                <div className="flex justify-between items-baseline mb-4">
                  <h2 className="text-xl font-bold text-white font-ubuntu">Send an invite</h2>
                  <span className="text-white/60 font-ubuntu text-sm">
                    {data.quota.left} of {data.quota.total} left
                  </span>
                </div>

                {fresh && (
                  <div className="mb-4 p-4 rounded-lg bg-[#1a1a1a] border border-[#E0FF04]/40">
                    <p className="text-[#E0FF04] font-ubuntu font-bold mb-1">Your invite link: copy it now</p>
                    <p className="text-white/60 font-ubuntu text-sm mb-3">
                      It works once and expires in 30 days. Only a fingerprint is stored, so this is the only time it is shown.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <code className="flex-1 bg-neutral-900 text-[#4FFFE3] font-mono text-sm rounded-lg p-3 break-all select-all">
                        {fresh.url}
                      </code>
                      <button
                        type="button"
                        onClick={() => copy(fresh.url)}
                        className="px-4 py-2 rounded-full bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold text-sm"
                      >
                        {copied === fresh.url ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {data.can_send ? (
                  data.quota.left > 0 ? (
                    <form onSubmit={create} className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Who is it for? (only you see this)"
                        maxLength={80}
                        className="flex-1 bg-[#1a1a1a] text-white font-ubuntu rounded-lg px-4 py-2 border border-white/10 focus:border-[#4FFFE3] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-6 py-2 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold disabled:opacity-50 whitespace-nowrap"
                      >
                        {busy ? 'Creating…' : 'Create invite'}
                      </button>
                    </form>
                  ) : (
                    <p className="text-white/60 font-ubuntu">You have used all your invites.</p>
                  )
                ) : (
                  <p className="text-white/60 font-ubuntu">{data.can_send_reason}</p>
                )}

                {notice && !notice.ok && <p className="mt-3 text-red-300 font-ubuntu text-sm">{notice.text}</p>}

                {data.invites.length > 0 && (
                  <ul className="mt-6 divide-y divide-white/10">
                    {data.invites.map((i) => (
                      <li key={i.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-ubuntu font-bold truncate">{i.note || 'Invite'}</p>
                          <p className="text-white/50 font-ubuntu text-xs">
                            {STATUS_TEXT[i.status]} · created {new Date(i.created_at).toLocaleDateString()}
                            {i.bonus && <> · {BONUS_TEXT[i.bonus]}</>}
                          </p>
                        </div>
                        {i.status === 'unused' && (
                          <button
                            type="button"
                            onClick={() => withdraw(i.id)}
                            className="text-red-300 hover:underline font-ubuntu text-sm"
                          >
                            Withdraw
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <RedeemCodePanel onRedeemed={load} />

              <section className="bg-[#3a3a3a] rounded-2xl p-6">
                <h2 className="text-xl font-bold text-white font-ubuntu mb-1">Your link</h2>
                <p className="text-white/60 font-ubuntu text-sm mb-3">
                  Open to anyone, any number of times. New members who arrive through it are credited to you.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <code className="flex-1 bg-neutral-900 text-[#4FFFE3] font-mono text-sm rounded-lg p-3 break-all select-all">
                    {data.affiliate_link}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(data.affiliate_link)}
                    className="px-4 py-2 rounded-full bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold text-sm"
                  >
                    {copied === data.affiliate_link ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </section>

              {data.premium?.premium && (
                <p className="text-center text-white/60 font-ubuntu text-sm">
                  {data.premium.lifetime
                    ? 'You have lifetime Premium.'
                    : data.premium.premium_until
                      ? `Premium until ${new Date(data.premium.premium_until).toLocaleDateString()}.`
                      : 'You have Premium.'}{' '}
                  <Link href="/featured" className="text-[#4FFFE3] hover:underline">Plans</Link>
                </p>
              )}
            </>
          )}
        </main>

        <Footer />
      </div>
    </div>
  )
}
