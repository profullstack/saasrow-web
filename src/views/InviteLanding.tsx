'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Gift } from 'lucide-react'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { openSignIn } from '../components/EarnKarmaNudge'
import { INVITE_RESULT, clearInvite, memberFetch, rememberInvite, useMember, type InviteOutcome } from '@/lib/member'

interface Props {
  code: string
  valid: boolean
  reason?: string
  inviter?: string
  bonusDays: number
}

export default function InviteLanding({ code, valid, reason, inviter, bonusDays }: Props) {
  const { member } = useMember()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // Keep the code until sign-in: the sign-in dialog sends it with the emailed code.
  useEffect(() => {
    if (valid) rememberInvite(code)
  }, [valid, code])

  // Signing in from this page accepts the invite on the server; show the outcome.
  useEffect(() => {
    const onResult = (e: Event) => {
      const r = (e as CustomEvent<InviteOutcome>).detail
      setResult({ ok: r.accepted, text: r.message })
    }
    window.addEventListener(INVITE_RESULT, onResult)
    return () => window.removeEventListener(INVITE_RESULT, onResult)
  }, [])

  const accept = async () => {
    setBusy(true)
    try {
      const r = await memberFetch<InviteOutcome>('/api/v1/me/invites/accept', { method: 'POST', body: { code } })
      clearInvite()
      setResult({ ok: true, text: r.message })
    } catch (e) {
      clearInvite()
      setResult({ ok: false, text: e instanceof Error ? e.message : 'Could not accept the invite' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-800">
      <div className="absolute w-full h-1/2 top-0 left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>
      <div className="relative z-10">
        <Header />
        <main className="w-full max-w-[640px] mx-auto px-4 py-16">
          <section className="bg-[#3a3a3a] rounded-2xl p-8 text-center">
            <Gift className="w-12 h-12 text-[#E0FF04] mx-auto mb-4" />
            {valid ? (
              <>
                <h1 className="text-white text-3xl md:text-4xl font-bold font-ubuntu mb-3">You&rsquo;re invited</h1>
                <p className="text-white/80 font-ubuntu text-lg mb-2">
                  {inviter} invited you to SaaSRow, the directory where makers list their software.
                </p>
                <p className="text-white/60 font-ubuntu mb-8">
                  Join with your email and you both get {bonusDays} days of Premium once your account is confirmed.
                </p>
                {result ? (
                  <p role="status" className={`font-ubuntu ${result.ok ? 'text-[#4FFFE3]' : 'text-red-300'}`}>
                    {result.text}
                  </p>
                ) : member ? (
                  <button
                    onClick={accept}
                    disabled={busy}
                    className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold disabled:opacity-50"
                  >
                    {busy ? 'Accepting…' : `Accept as ${member.email}`}
                  </button>
                ) : (
                  <button
                    onClick={openSignIn}
                    className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold"
                  >
                    Join with your email
                  </button>
                )}
              </>
            ) : (
              <>
                <h1 className="text-white text-3xl font-bold font-ubuntu mb-3">This invite can&rsquo;t be used</h1>
                <p className="text-white/70 font-ubuntu mb-8">{reason}</p>
                <Link
                  href="/"
                  className="px-8 py-3 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold"
                >
                  Browse SaaSRow
                </Link>
              </>
            )}
          </section>
        </main>
        <Footer />
      </div>
    </div>
  )
}
