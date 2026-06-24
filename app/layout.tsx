import type { Metadata, Viewport } from 'next'
import { ReferralProvider } from '@profullstack/referrals/react';
import Script from 'next/script'
import './globals.css'

const SITE_URL = 'https://saasrow.com'

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
      <body>
        <ReferralProvider>{children}</ReferralProvider>
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
      <script async src="https://feedback.profullstack.com/embed/profullstack-feedback.js" data-property="saasrow.com"></script></body>
    </html>
  )
}
