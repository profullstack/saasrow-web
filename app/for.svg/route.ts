import { badgeListingBySite } from '@/lib/badge'
import { badgeSvg, badgeTheme, listBadgeSvg } from '@/lib/badgeShared'

// The badge by domain: /for.svg?site=example.com draws the badge of whatever
// listing that site is, so one line of HTML works in a footer shared by many
// sites (each passes its own domain). A site with no listing gets the "list
// your software" badge instead. Ends in .svg, so middleware never runs: the
// image is loaded by other sites' visitors.
export const dynamic = 'force-dynamic'

const svg = (body: string, maxAge: number) =>
  new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const theme = badgeTheme(params.get('theme'))
  try {
    const listing = await badgeListingBySite(params.get('site') ?? '')
    return listing ? svg(badgeSvg(listing, theme), 300) : svg(listBadgeSvg(theme), 600)
  } catch (error) {
    console.error('[for.svg]', error)
    return svg(listBadgeSvg(theme), 60)
  }
}
