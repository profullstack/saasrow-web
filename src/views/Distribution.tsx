import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import type { DistributionStats } from '../lib/distribution'

interface Props {
  stats: DistributionStats
  siteUrl: string
  botCount: number
}

const nf = new Intl.NumberFormat('en-US')

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[#3a3a3a] rounded-2xl p-6">
      <h3 className="text-white text-3xl font-bold font-ubuntu mb-2">{value}</h3>
      <p className="text-white/70 font-ubuntu text-sm">{label}</p>
    </div>
  )
}

function Channel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-[#3a3a3a] rounded-2xl p-6">
      <h3 className="text-white text-xl font-bold font-ubuntu mb-3">{title}</h3>
      <div className="text-white/70 font-ubuntu text-base leading-relaxed">{children}</div>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="block bg-neutral-900 text-[#4fffe3] font-mono text-sm rounded-lg p-4 mt-3 overflow-x-auto whitespace-pre">
      {children}
    </code>
  )
}

export default function DistributionPage({ stats, siteUrl, botCount }: Props) {
  return (
    <div className="min-h-screen bg-neutral-800 relative">
      <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1000px] mx-auto px-4 py-12">
          <h1 className="text-white text-5xl font-bold font-ubuntu mb-4">
            List once. Get found everywhere.
          </h1>
          <p className="text-white/80 font-ubuntu text-xl leading-relaxed mb-10 max-w-3xl">
            A listing on SaaSRow is not just a page on a website. It is published
            simultaneously as structured data for search engines, as a machine-readable
            document for AI assistants, and as a queryable endpoint for any app or agent
            that wants it — with no API key and no paywall on any of those channels. And
            you can create and manage your listing from the terminal or an AI agent, free.
          </p>

          <h2 className="text-white text-3xl font-bold font-ubuntu mb-6">
            Your product is found across every channel at once
          </h2>

          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <Channel title="AI assistants">
              Every listing ships with schema.org <span className="text-white">JSON-LD</span>,
              a plain-markdown rendering, and an entry in{' '}
              <a href="/llms.txt" className="text-[#4fffe3] hover:underline">
                llms.txt
              </a>
              . Assistants like ChatGPT and Claude read structured facts rather than
              guessing at your marketing copy.
            </Channel>

            <Channel title="Search engines">
              Listings, categories and tags are all in the sitemap, with{' '}
              <span className="text-white">SoftwareApplication</span>,{' '}
              <span className="text-white">ItemList</span> and{' '}
              <span className="text-white">BreadcrumbList</span> markup so search engines
              can render rich results instead of a plain blue link.
            </Channel>

            <Channel title="Public API">
              Any app can query the directory. Free, unauthenticated, CORS-enabled. With an
              API key, the same API creates and edits your own listings.
              <Code>{`curl "${siteUrl}/api/v1/products?use_case=analytics&pricing_model=free"`}</Code>
            </Channel>

            <Channel title="MCP server">
              AI agents and dev tools reach the directory over the Model Context Protocol
              — the same data as callable tools. Add a key and the agent can list your
              product for you.
              <Code>{`claude mcp add --transport http saasrow ${siteUrl}/api/mcp`}</Code>
            </Channel>

            <Channel title="Command line">
              Sign in with an emailed code, then create, edit and delete listings and
              manage API keys without leaving the terminal. Every command has{' '}
              <span className="text-white">--json</span> for scripts and agents.
              <Code>{`npx @profullstack/saasrow login\nsaasrow listings create --name "Acme" --website https://acme.example --description "…"`}</Code>
            </Channel>

            <Channel title="API keys, your way">
              Create as many keys as you have machines and agents, name them, see when
              each was last used, and revoke one without touching the others — from the
              CLI, the API, or your listing management page.
            </Channel>

            <Channel title="Structured vocabulary">
              Use cases, audiences, platforms and pricing models come from{' '}
              <a href="/api/v1/vocabulary" className="text-[#4fffe3] hover:underline">
                closed vocabularies
              </a>
              , so a query for one term returns the same set every time. Free text can't
              do that.
            </Channel>

            <Channel title="Alternative-to matching">
              Listings record the products they compete with, so &ldquo;what&apos;s a good
              alternative to X?&rdquo; — one of the most common ways anyone looks for
              software — resolves to your product by name.
            </Channel>
          </div>

          <h2 className="text-white text-3xl font-bold font-ubuntu mb-2">
            Measured, not estimated
          </h2>
          <p className="text-white/70 font-ubuntu mb-6 max-w-3xl">
            These are counted events from the last 30 days, not projections. The counting
            method is published alongside the numbers at{' '}
            <a href="/api/v1/stats" className="text-[#4fffe3] hover:underline">
              /api/v1/stats
            </a>
            , so you can check it yourself.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-4">
            <Stat value={nf.format(stats.aiReadsLast30Days)} label="AI assistant reads (30 days)" />
            <Stat
              value={nf.format(stats.distinctBotsLast30Days)}
              label="Distinct AI clients seen (30 days)"
            />
            <Stat value={nf.format(stats.listings)} label="Published listings" />
            <Stat value={nf.format(stats.categories)} label="Categories" />
            <Stat value={nf.format(stats.upvotes)} label="Community upvotes" />
            <Stat value={nf.format(stats.views)} label="Listing views" />
          </div>

          <p className="text-white/50 font-ubuntu text-sm mb-12">
            AI reads are attributed against {botCount} documented crawler and agent
            user-agents. Ordinary browser traffic is excluded, and no IP addresses or raw
            user-agent strings are stored.
          </p>

          <div className="bg-[#3a3a3a] rounded-2xl p-8">
            <h2 className="text-white text-2xl font-bold font-ubuntu mb-4">
              For developers
            </h2>
            <p className="text-white/70 font-ubuntu mb-4">
              The whole surface is self-describing — start at the API index and follow the
              links.
            </p>
            <ul className="text-white/80 font-ubuntu space-y-2">
              <li>
                <a href="/api/v1" className="text-[#4fffe3] hover:underline">
                  /api/v1
                </a>{' '}
                — endpoint index and parameter reference
              </li>
              <li>
                <a href="/api/v1/products" className="text-[#4fffe3] hover:underline">
                  /api/v1/products
                </a>{' '}
                — search and filter listings
              </li>
              <li>
                <a href="/api/v1/vocabulary" className="text-[#4fffe3] hover:underline">
                  /api/v1/vocabulary
                </a>{' '}
                — the controlled filter terms
              </li>
              <li>
                <a href="/api/mcp" className="text-[#4fffe3] hover:underline">
                  /api/mcp
                </a>{' '}
                — MCP server details
              </li>
              <li>
                <a
                  href="https://www.npmjs.com/package/@profullstack/saasrow"
                  className="text-[#4fffe3] hover:underline"
                >
                  @profullstack/saasrow
                </a>{' '}
                — the CLI, with <span className="text-white">saasrow login</span> to get
                your first API key
              </li>
              <li>
                <a href="/llms-full.txt" className="text-[#4fffe3] hover:underline">
                  /llms-full.txt
                </a>{' '}
                — the entire directory as one markdown file
              </li>
            </ul>
          </div>

          <div className="mt-10 text-center">
            <a
              href="/submit"
              className="inline-block bg-[#4fffe3] text-neutral-900 font-bold font-ubuntu text-lg rounded-xl px-8 py-4 hover:opacity-90 transition-opacity"
            >
              Submit your product
            </a>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}
