'use client'

import { useState } from 'react'
import {
  ENHANCED_LIMITS,
  cleanEnhanced,
  featureLines,
  hasEnhancedTier,
  parseFeatureLines,
  parsePlanLines,
  planLines,
  type EnhancedListing,
} from '../lib/enhanced'

interface EnhancedEditorProps {
  listing: { id: string; tier?: string | null; enhanced?: EnhancedListing | null }
  managementToken?: string
  onSaved?: (enhanced: EnhancedListing | null) => void
}

/**
 * The owner's editor for a listing's enhanced sections. Featured and Premium
 * listings edit them; a free listing sees what it would get and where to
 * upgrade.
 */
export function EnhancedEditor({ listing, managementToken, onSaved }: EnhancedEditorProps) {
  const start = listing.enhanced ?? {}
  const [open, setOpen] = useState(false)
  const [overview, setOverview] = useState(start.overview ?? '')
  const [features, setFeatures] = useState(featureLines(start.features))
  const [pricing, setPricing] = useState(planLines(start.pricing))
  const [audience, setAudience] = useState(start.audience ?? '')
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  if (!hasEnhancedTier(listing.tier)) {
    return (
      <div className="rounded-xl p-4 mb-4 border border-white/10 bg-black/20">
        <h3 className="text-white font-bold font-ubuntu mb-1">Enhanced listing</h3>
        <p className="text-white/70 text-sm font-ubuntu">
          Featured and Premium listings get an overview, a named feature list, a pricing table and a &quot;who
          it&apos;s for&quot; section on their page.{' '}
          <a href="/featured" className="text-[#E0FF04] underline">Featured is $2 lifetime</a>.
        </p>
      </div>
    )
  }

  const save = async () => {
    if (!managementToken) return
    setSaving(true)
    setNote(null)
    const enhanced = cleanEnhanced({
      overview,
      audience,
      features: parseFeatureLines(features),
      pricing: parsePlanLines(pricing),
    })
    try {
      const res = await fetch(`/api/v1/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-management-token': managementToken },
        body: JSON.stringify({ enhanced: enhanced ?? {} }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setNote(body?.error?.message || 'Could not save. Try again in a minute.')
        return
      }
      onSaved?.(enhanced)
      setNote(enhanced ? 'Saved. It is on your listing page now.' : 'Cleared.')
    } catch {
      setNote('Could not save. Try again in a minute.')
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-lg bg-black/40 border border-white/10 text-white/90 text-sm font-ubuntu p-3 mb-1'
  const hint = 'text-white/50 text-xs font-ubuntu mb-4'
  const label = 'block text-white font-ubuntu font-bold text-sm mb-1'

  return (
    <div className="rounded-xl p-4 mb-4 border border-[#E0FF04]/40 bg-[#E0FF04]/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[#E0FF04] font-bold font-ubuntu">Enhanced listing</h3>
          <p className="text-white/70 text-sm font-ubuntu">
            {listing.enhanced ? 'Shown on your listing page.' : 'Add an overview, features, pricing and who it is for.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="px-4 py-2 rounded-full bg-[#4FFFE3]/20 text-[#4FFFE3] border border-[#4FFFE3] font-ubuntu font-bold text-sm hover:bg-[#4FFFE3]/30 transition-colors"
        >
          {open ? 'Close' : listing.enhanced ? 'Edit' : 'Add'}
        </button>
      </div>

      {open && (
        <div className="mt-4">
          <label className={label} htmlFor={`enh-overview-${listing.id}`}>Overview</label>
          <textarea id={`enh-overview-${listing.id}`} rows={5} maxLength={ENHANCED_LIMITS.overview} value={overview} onChange={(e) => setOverview(e.target.value)} className={field} />
          <p className={hint}>What it is and what it does, in a few paragraphs.</p>

          <label className={label} htmlFor={`enh-features-${listing.id}`}>Features</label>
          <textarea id={`enh-features-${listing.id}`} rows={6} value={features} onChange={(e) => setFeatures(e.target.value)} placeholder="Live attack detection: reads your logs and bans attackers at the firewall" className={field} />
          <p className={hint}>One per line, as Name: what it does. Up to {ENHANCED_LIMITS.features}.</p>

          <label className={label} htmlFor={`enh-pricing-${listing.id}`}>Pricing</label>
          <textarea id={`enh-pricing-${listing.id}`} rows={4} value={pricing} onChange={(e) => setPricing(e.target.value)} placeholder="Free | $0 | Core features for one site" className={field} />
          <p className={hint}>One plan per line, as Plan | Price | What it includes. Up to {ENHANCED_LIMITS.plans}.</p>

          <label className={label} htmlFor={`enh-audience-${listing.id}`}>Who it&apos;s for</label>
          <textarea id={`enh-audience-${listing.id}`} rows={3} maxLength={ENHANCED_LIMITS.audience} value={audience} onChange={(e) => setAudience(e.target.value)} className={field} />
          <p className={hint}>The people and teams it is built for.</p>

          <button
            type="button"
            onClick={save}
            disabled={saving || !managementToken}
            className="px-6 py-2 rounded-full bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 font-ubuntu font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save enhanced listing'}
          </button>
          {note && <p role="status" className="text-white/80 text-sm font-ubuntu mt-3">{note}</p>}
        </div>
      )}
    </div>
  )
}
