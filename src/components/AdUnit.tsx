'use client'

const AD_SLOT = 'f04c05e3-f8b5-4209-883b-d0447800872b'
const AD_FORMAT = 'text_link'

interface AdUnitProps {
  className?: string
}

/**
 * CrawlProof ad slot. The global loader (crawlproof.com/ad.js, added in the
 * root layout) scans for [data-cp-ad] elements and fills each in place with a
 * thin 40px text_link line that carries its own "Sponsored" mark. Low profile:
 * one per page, inside page content (under the page heading), no label or
 * box, never on the home page, never directly above or inside the footer.
 */
export function AdUnit({ className = '' }: AdUnitProps) {
  return <div data-cp-ad="" data-slot={AD_SLOT} data-format={AD_FORMAT} className={`w-full my-3 ${className}`} />
}
