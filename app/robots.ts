import type { MetadataRoute } from 'next'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.saasrow.com').replace(
  /\/+$/,
  '',
)

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/manage', '/api/', '/favorites', '/unsubscribe'],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  }
}
