'use client'

import { useState } from 'react'
import { Ticket } from 'lucide-react'
import { memberHeaders } from '@/lib/member'

// "Have a code?": redeem a credit code for days of Premium. On /manage it
// authenticates with the page's management token; elsewhere with the signed-in
// member's cookie.

interface Props {
  managementToken?: string
  onRedeemed?: () => void
}

interface Redeemed {
  ok: true
  days: number
  premium: { premium: boolean; lifetime: boolean; premium_until: string | null }
}

export function RedeemCodePanel({ managementToken, onRedeemed }: Props) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch('/api/v1/me/credits/redeem', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(managementToken ? { 'X-Management-Token': managementToken } : memberHeaders()),
        },
        body: JSON.stringify({ code: code.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || 'That code did not work')
      const r = body as Redeemed
      const until = r.premium.lifetime
        ? 'You already have lifetime Premium, so nothing changes.'
        : r.premium.premium_until
          ? `Premium until ${new Date(r.premium.premium_until).toLocaleDateString()}.`
          : ''
      setNotice({ ok: true, text: `Redeemed: ${r.days} days of Premium. ${until}`.trim() })
      setCode('')
      onRedeemed?.()
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'That code did not work' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-[#3a3a3a] rounded-2xl p-6">
      <h2 className="text-xl font-bold text-white mb-1 font-ubuntu flex items-center gap-2">
        <Ticket className="w-5 h-5 text-[#E0FF04]" />
        Have a code?
      </h2>
      <p className="text-white/60 font-ubuntu text-sm mb-4">
        Credit codes add days of Premium to your account. A running term is extended; lifetime stays lifetime.
      </p>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CR-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
          aria-label="Credit code"
          className="flex-1 bg-[#1a1a1a] text-white font-mono rounded-lg px-4 py-2 border border-white/10 focus:border-[#4FFFE3] focus:outline-none uppercase"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="px-6 py-2 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? 'Redeeming…' : 'Redeem'}
        </button>
      </form>
      {notice && (
        <p role="status" className={`mt-3 font-ubuntu text-sm ${notice.ok ? 'text-[#4FFFE3]' : 'text-red-300'}`}>
          {notice.text}
        </p>
      )}
    </div>
  )
}
