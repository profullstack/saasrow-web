import { getBlogList } from '@/lib/api'

// Regenerate at most hourly so new posts show up without a full rebuild.
export const revalidate = 3600

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.saasrow.com').replace(
  /\/+$/,
  '',
)

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const posts = await getBlogList()

  const lastBuildDate = new Date().toUTCString()
  const latest = posts[0]
  const pubDate = latest
    ? new Date(latest.published_at || latest.created_at).toUTCString()
    : lastBuildDate

  const items = posts
    .map((post) => {
      const link = `${SITE}/blog/${post.slug}`
      const date = new Date(post.published_at || post.created_at).toUTCString()
      const parts = [
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${date}</pubDate>`,
      ]
      if (post.excerpt) {
        parts.push(`      <description>${escapeXml(post.excerpt)}</description>`)
      }
      if (post.author_name) {
        parts.push(`      <dc:creator>${escapeXml(post.author_name)}</dc:creator>`)
      }
      for (const tag of post.tags ?? []) {
        parts.push(`      <category>${escapeXml(tag)}</category>`)
      }
      return `    <item>\n${parts.join('\n')}\n    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>SaaSRow Blog</title>
    <link>${SITE}/blog</link>
    <description>Articles, guides, and insights about software and productivity</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <pubDate>${pubDate}</pubDate>
    <atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
