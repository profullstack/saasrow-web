'use client'

const AD_SLOT = 'f04c05e3-f8b5-4209-883b-d0447800872b'
const AD_FORMAT = 'banner_300x250'

interface AdUnitProps {
  className?: string
}

/**
 * CrawlProof ad slot. The global loader (crawlproof.com/ad.js, added in the
 * root layout) scans for [data-cp-ad] elements and fills each in place with a
 * 300x250 iframe. Drop this anywhere inside page content — never leave a bare
 * slot div at the end of <body>, or it renders below the footer.
 */
export function AdUnit({ className = '' }: AdUnitProps) {
  return (
    <div className={`flex flex-col items-center gap-2 my-12 ${className}`}>
      <span className="text-white/30 font-ubuntu text-[10px] uppercase tracking-widest">
        Advertisement
      </span>
      <div
        data-cp-ad=""
        data-slot={AD_SLOT}
        data-format={AD_FORMAT}
        className="min-h-[250px] w-[300px]"
      />
    </div>
  )
}
