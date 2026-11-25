import { badgeListing } from '@/lib/badge'
import { badgeSvg, badgeTheme, listBadgeSvg } from '@/lib/badgeShared'

// The embeddable "Listed on SaaSRow" badge for one listing, with its live
// upvote count. Free listings carry it on their site to stay live. The path
// ends in .svg, so middleware (throttle, crawl gateway) never runs for it: the
// image is loaded by other sites' visitors, who must never be metered or
// asked to pay.
export const dynamic = 'force-dynamic'

const svg = (body: string, status: number, maxAge: number) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const theme = badgeTheme(new URL(req.url).searchParams.get('theme'))
  try {
    const listing = await badgeListing(id)
    // Unknown id: still an image, so a stale embed never shows a broken icon.
    return listing ? svg(badgeSvg(listing, theme), 200, 300) : svg(listBadgeSvg(theme), 404, 60)
  } catch (error) {
    console.error('[software/[id]/badge.svg]', error)
    return svg(listBadgeSvg(theme), 200, 60)
  }
}
