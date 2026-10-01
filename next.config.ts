import type { NextConfig } from 'next'

const supabaseHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return undefined
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
})()

const config: NextConfig = {
  // The image runs the standalone server under Bun (`bun server.js`).
  output: 'standalone',
  // Trace from this directory, never a lockfile further up the disk, so
  // server.js always lands at the top of .next/standalone.
  outputFileTracingRoot: new URL('.', import.meta.url).pathname,
  reactStrictMode: true,
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
}

export default config
