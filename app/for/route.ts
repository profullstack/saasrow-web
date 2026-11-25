import { badgeListingBySite } from '@/lib/badge'
import { siteUrl } from '@/lib/structuredData'

// Where the by-domain badge links: /for?site=example.com goes to that site's
// listing, or to the submit page when it has none yet.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const site = new URL(req.url).searchParams.get('site') ?? ''
  const base = siteUrl()
  let target = `${base}/submit?ref=badge`
  try {
    const listing = await badgeListingBySite(site)
    if (listing) target = `${base}/software/${listing.id}?ref=badge`
  } catch (error) {
    console.error('[for]', error)
  }
  return new Response(null, {
    status: 302,
    headers: { Location: target, 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' },
  })
}
