import type { Metadata } from 'next'
import Developers from '@/views/Developers'
import { siteUrl } from '@/lib/structuredData'

const description =
  'List your software from the terminal, a script or your AI agent. Free read API, MCP server, and a CLI with saasrow login for creating and managing listings and API keys.'

export const metadata: Metadata = {
  title: 'Developers: API, MCP server and CLI',
  description,
  alternates: { canonical: '/developers' },
  openGraph: {
    title: 'SaaSRow for developers: API, MCP server and CLI',
    description,
    url: '/developers',
    type: 'website',
  },
}

export default function Page() {
  return <Developers siteUrl={siteUrl()} />
}
