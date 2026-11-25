'use client'

import { useState } from 'react'
import { badgeSnippets, badgeState, type BadgeColumns } from '../lib/badgeShared'

const FALLBACK_SITE = 'https://saasrow.pwa.pit.world'

interface BadgePanelProps {
  listing: BadgeColumns & { id: string; title: string; url: string }
  /** With a management token the owner can re-check the site at once. */
  managementToken?: string
  /** Called with the listing's fresh badge columns and status after a check. */
  onChecked?: (patch: BadgeColumns) => void
  className?: string
}

/**
 * The badge a free listing has to carry on its website to be live: where it
 * stands, the HTML to paste, and (for the owner) a button to check now.
 * Featured and Premium listings do not need it and get nothing rendered.
 */
export function BadgePanel({ listing, managementToken, onChecked, className = '' }: BadgePanelProps) {
  const [light, setLight] = useState(false)
  const [copied, setCopied] = useState(false)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const state = badgeState(listing)
  if (!state.required) return null

  const site = typeof window === 'undefined' ? FALLBACK_SITE : window.location.origin
  const snip = badgeSnippets(listing, site)
  const chosen = light ? snip.light : snip.dark

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(chosen.html)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setResult('Select the HTML and copy it by hand: your browser blocked the clipboard.')
    }
  }

  const check = async () => {
    if (!managementToken) return
    setChecking(true)
    setResult(null)
    try {
      const res = await fetch(`/api/v1/listings/${listing.id}/badge/check`, {
        method: 'POST',
        headers: { 'x-management-token': managementToken },
      })
      const body = await res.json()
      if (!res.ok) {
        setResult(body?.error?.message || 'The check failed. Try again in a minute.')
        return
      }
      const d = body.data
      onChecked?.({
        status: d.status,
        badge_verified_at: d.verified_at,
        badge_checked_at: d.checked_at,
        badge_grace_until: d.grace_until,
      })
      if (d.verified) setResult(`Found on ${d.found_on}. ${d.status === 'approved' ? 'Your listing is live.' : 'It goes live as soon as it is approved.'}`)
      else if (d.reachable) setResult(`No link to your SaaSRow page on ${d.looked.join(' or ')} yet. It has to be in the page's HTML, not added later by JavaScript.`)
      else setResult(`We could not read ${d.looked.join(' or ')}. Is the site up and reachable without a login?`)
    } catch {
      setResult('The check failed. Try again in a minute.')
    } finally {
      setChecking(false)
    }
  }

  const headline = state.verified
    ? '✓ Badge verified'
    : state.hidden
      ? 'Approved, hidden until the badge is on your site'
      : state.grace_until
        ? `Add the badge by ${new Date(state.grace_until).toLocaleDateString()} to keep this listing live`
        : 'Add the badge to go live'

  return (
    <div
      className={`rounded-xl p-4 mb-4 border ${
        state.verified ? 'border-[#4FFFE3]/40 bg-[#4FFFE3]/5' : 'border-[#E0FF04]/50 bg-[#E0FF04]/5'
      } ${className}`}
    >
      <h3 className={`font-bold font-ubuntu mb-1 ${state.verified ? 'text-[#4FFFE3]' : 'text-[#E0FF04]'}`}>{headline}</h3>
      <p className="text-white/70 text-sm font-ubuntu mb-3">
        {state.verified
          ? 'Keep it there: we re-check every day, and a listing whose badge is gone is hidden after 3 days.'
          : (
            <>
              Free listings are live while <span className="text-white break-all">{listing.url}</span> links back to its
              SaaSRow page. Paste this where it appears in the page&apos;s HTML (the footer works). Or{' '}
              <a href="/featured" className="text-[#E0FF04] underline">go Featured for $2 lifetime</a>: no badge needed.
            </>
          )}
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={chosen.image} alt={snip.alt} width={200} height={44} className={`mb-3 rounded-lg ${light ? 'bg-white p-1' : ''}`} />

      <textarea
        readOnly
        value={chosen.html}
        rows={3}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Badge HTML"
        className="w-full rounded-lg bg-black/40 border border-white/10 text-white/90 text-xs font-mono p-3 mb-3 resize-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="px-4 py-2 rounded-full bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold text-sm hover:bg-[#4FFFE3]/30 transition-colors"
        >
          {copied ? 'Copied' : 'Copy HTML'}
        </button>
        <button
          type="button"
          onClick={() => setLight((v) => !v)}
          className="px-4 py-2 rounded-full text-white/80 border border-white/20 font-ubuntu text-sm hover:bg-white/10 transition-colors"
        >
          {light ? 'Dark badge' : 'Light badge'}
        </button>
        {managementToken && (
          <button
            type="button"
            onClick={check}
            disabled={checking}
            className="px-4 py-2 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {checking ? 'Checking…' : 'Check my site now'}
          </button>
        )}
      </div>

      {result && (
        <p role="status" className="text-white/80 text-sm font-ubuntu mt-3">
          {result}
        </p>
      )}
    </div>
  )
}
