import type { EnhancedListing } from '../lib/enhanced'

/**
 * The enhanced part of a Featured or Premium listing's page: overview,
 * features, pricing and who it is for. Plain text throughout (React escapes
 * it); renders nothing when there is nothing to show.
 */
export function EnhancedSections({ data }: { data: EnhancedListing | null | undefined }) {
  if (!data || (!data.overview && !data.features?.length && !data.pricing?.length && !data.audience)) return null
  const h2 = 'text-white text-2xl font-bold font-ubuntu mb-4'
  return (
    <section aria-label="Enhanced listing" className="bg-[#3a3a3a] rounded-2xl p-6 sm:p-8 mb-8 border border-[#E0FF04]/20">
      <p className="inline-block px-3 py-1 mb-6 rounded-full text-xs font-bold font-ubuntu bg-gradient-to-r from-[#E0FF04] to-[#4FFFE3] text-neutral-800">
        Enhanced listing
      </p>

      {data.overview && (
        <div className="mb-8">
          <h2 className={h2}>Overview</h2>
          <p className="text-white/80 font-ubuntu text-lg leading-relaxed whitespace-pre-line">{data.overview}</p>
        </div>
      )}

      {data.features && data.features.length > 0 && (
        <div className="mb-8">
          <h2 className={h2}>Features</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.features.map((f) => (
              <div key={f.name} className="bg-black/20 rounded-xl p-4">
                <dt className="text-[#4FFFE3] font-ubuntu font-bold mb-1">{f.name}</dt>
                <dd className="text-white/75 font-ubuntu text-sm leading-relaxed">{f.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {data.pricing && data.pricing.length > 0 && (
        <div className="mb-8">
          <h2 className={h2}>Pricing</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-ubuntu">
              <thead>
                <tr className="text-white/50 text-sm border-b border-white/10">
                  <th scope="col" className="py-2 pr-4 font-normal">Plan</th>
                  <th scope="col" className="py-2 pr-4 font-normal">Price</th>
                  <th scope="col" className="py-2 font-normal">Includes</th>
                </tr>
              </thead>
              <tbody>
                {data.pricing.map((p) => (
                  <tr key={p.plan} className="border-b border-white/5 align-top">
                    <th scope="row" className="py-3 pr-4 text-white font-bold">{p.plan}</th>
                    <td className="py-3 pr-4 text-[#E0FF04] whitespace-nowrap">{p.price}</td>
                    <td className="py-3 text-white/75 text-sm">{p.includes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.audience && (
        <div>
          <h2 className={h2}>Who it&apos;s for</h2>
          <p className="text-white/80 font-ubuntu leading-relaxed whitespace-pre-line">{data.audience}</p>
        </div>
      )}
    </section>
  )
}
