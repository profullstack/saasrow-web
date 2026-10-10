import type { Metadata, Viewport } from 'next'
import { ReferralProvider } from '@profullstack/referrals/react';
import Script from 'next/script'
import { Footer as PfsFooter } from '@profullstack/footer/react'
import { FooterBottomProvider } from '@/components/FooterBottom'
import JsonLd from '@/components/JsonLd'
import { websiteLd, organizationLd } from '@/lib/structuredData'
import './globals.css'

const SITE_URL = 'https://saasrow.com'

// Re-render hourly so @profullstack/footer picks up its @latest template.
export const revalidate = 3600

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'SaaSRow - Software Directory',
    template: '%s | SaaSRow',
  },
  description: 'Discover and submit software in the SaaSRow directory.',
  other: {
    'ahrefs-site-verification':
      '786cf10696dea187ec4d91d3b286340b2eca436b3e4664c85464c8c1e23f21ec',
  },
  openGraph: {
    type: 'website',
    siteName: 'SaaSRow',
    url: SITE_URL,
  },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Site-level identity + SearchAction, so an assistant can query the
            directory directly instead of scraping listing pages. */}
        <JsonLd data={websiteLd()} />
        <JsonLd data={organizationLd()} />
        <link
          rel="alternate"
          type="text/plain"
          href="/llms.txt"
          title="LLM-readable site index"
        />
      </head>
      <body>
        <ReferralProvider>
          <FooterBottomProvider
            bottom={
              <PfsFooter
                site="https://saasrow.com/"
                since={2025}
                links={[
                  { label: 'Terms of Service', href: '/terms' },
                  { label: 'Privacy Policy', href: '/privacy' },
                  { label: 'Unsubscribe', href: '/unsubscribe' },
                ]}
              />
            }
          >
            {children}
          </FooterBottomProvider>
        </ReferralProvider>
        <Script
          src="https://analytics.ahrefs.com/analytics.js"
          data-key="jrCaJNA5B0FqNBQqJOAaYw"
          strategy="afterInteractive"
          async
        />
        <Script
          src="https://datafa.st/js/script.js"
          data-website-id="dfid_ymwgZYB7fCWFQQX3c74DG"
          data-domain="saasrow.com"
          strategy="afterInteractive"
          defer
        />
              <Script data-site="f2463c61-25b8-47af-bf2a-096563b37bf5" src="https://crawlproof.com/stats.js" strategy="afterInteractive" />
      {/* CrawlProof ad loader: scans for [data-cp-ad] slots (rendered by <AdUnit />) and fills them in place. */}
      <Script src="https://crawlproof.com/ad.js" strategy="afterInteractive" />
      </body>
    </html>
  )
}
