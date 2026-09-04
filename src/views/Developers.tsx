import Link from 'next/link'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

interface Props {
  siteUrl: string
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string
  title: string
  lead?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="bg-[#3a3a3a] rounded-2xl p-6 md:p-8 mb-8 scroll-mt-8">
      <h2 className="text-white text-2xl md:text-3xl font-bold font-ubuntu mb-3">{title}</h2>
      {lead && <p className="text-white/70 font-ubuntu text-base leading-relaxed mb-4">{lead}</p>}
      <div className="text-white/70 font-ubuntu text-base leading-relaxed space-y-4">{children}</div>
    </section>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-neutral-900 text-[#4fffe3] font-mono text-sm rounded-lg p-4 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  )
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith('http')
  return external ? (
    <a href={href} className="text-[#4fffe3] hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <Link href={href} className="text-[#4fffe3] hover:underline">
      {children}
    </Link>
  )
}

function Row({ method, path, what }: { method: string; path: string; what: string }) {
  return (
    <tr className="border-t border-white/10">
      <td className="py-2 pr-4 font-mono text-xs text-[#e0ff04] whitespace-nowrap align-top">{method}</td>
      <td className="py-2 pr-4 font-mono text-xs text-white whitespace-nowrap align-top">{path}</td>
      <td className="py-2 text-white/70 text-sm align-top">{what}</td>
    </tr>
  )
}

export default function DevelopersPage({ siteUrl }: Props) {
  const nav = [
    ['quick-start', 'Quick start'],
    ['cli', 'CLI'],
    ['mcp', 'MCP server'],
    ['api', 'REST API'],
    ['keys', 'API keys'],
    ['accounts', 'Accounts'],
  ]

  return (
    <div className="min-h-screen bg-neutral-800 relative">
      <div className="absolute w-full h-1/2 top-[7.45%] left-0 pointer-events-none">
        <div className="absolute w-4/5 h-40 top-1/3 left-[12.93%] bg-[#4fffe34c] rotate-[37.69deg] blur-[150px]" />
        <div className="absolute w-4/5 h-40 top-1/4 left-[22.59%] bg-[#e0ff044c] rotate-[37.69deg] blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-[1000px] mx-auto px-4 py-12">
          <p className="text-[#e0ff04] font-ubuntu font-bold uppercase tracking-wide text-sm mb-3">
            Developers
          </p>
          <h1 className="text-white text-4xl md:text-5xl font-bold font-ubuntu mb-4">
            List your product from the terminal, a script, or your AI agent.
          </h1>
          <p className="text-white/80 font-ubuntu text-xl leading-relaxed mb-8 max-w-3xl">
            Reading the directory is free and needs no key. Creating and managing your own free
            listings needs an account, which is just an email address and a one-time code. One
            API key works everywhere: the CLI, the REST API and the MCP server.
          </p>

          <nav className="flex flex-wrap gap-3 mb-10">
            {nav.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="px-4 py-2 rounded-full border border-white/20 text-white/80 font-ubuntu text-sm hover:border-[#4fffe3] hover:text-[#4fffe3] transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>

          <Section
            id="quick-start"
            title="Quick start"
            lead="Three commands from nothing to a listing awaiting review."
          >
            <Code>{`npx @profullstack/saasrow login
# → enter your email, then the code we send you

saasrow listings create \\
  --name "Acme Analytics" \\
  --website https://acme.example \\
  --description "Privacy-first product analytics you can self-host." \\
  --category Analytics \\
  --tags analytics,privacy,self-hosted \\
  --pricing-model freemium

saasrow listings list`}</Code>
            <p>
              A listing submitted this way is exactly what the website&apos;s submit form produces:
              it is reviewed before it appears, it is free, and it gets the same management page
              and dofollow link.
            </p>
          </Section>

          <Section
            id="cli"
            title="CLI"
            lead="A zero-dependency Node command, published as @profullstack/saasrow. Install it globally or run it with npx."
          >
            <Code>{`npm install -g @profullstack/saasrow

saasrow login                      # emailed code → API key stored locally
saasrow whoami
saasrow logout --revoke            # forget the key and kill it on the server

saasrow listings list
saasrow listings get <id>
saasrow listings create --name … --website … --description … [--tags a,b] [--use-cases …]
saasrow listings update <id> --description "…"
saasrow listings delete <id>

saasrow keys list
saasrow keys create "CI deploy"    # prints the key once
saasrow keys rename <id|prefix> "Laptop"
saasrow keys revoke <id|prefix>

saasrow search "analytics" --pricing-model free
saasrow categories
saasrow vocabulary`}</Code>
            <p>
              Every command accepts <span className="text-white font-mono">--json</span> and then
              prints the raw API response, so output pipes cleanly into scripts and agents. For
              CI, skip the stored key and set{' '}
              <span className="text-white font-mono">SAASROW_API_KEY</span>. Fields can also come
              from a file with <span className="text-white font-mono">--from listing.json</span>.
            </p>
            <p>
              Source and README:{' '}
              <A href="https://github.com/profullstack/saasrow-web/tree/main/cli">
                github.com/profullstack/saasrow-web/cli
              </A>{' '}
              · npm:{' '}
              <A href="https://www.npmjs.com/package/@profullstack/saasrow">
                @profullstack/saasrow
              </A>
            </p>
          </Section>

          <Section
            id="mcp"
            title="MCP server"
            lead="AI agents reach the directory over the Model Context Protocol. Without a key they can search; with one they can list your product for you."
          >
            <Code>{`# read-only
claude mcp add --transport http saasrow ${siteUrl}/api/mcp

# with an API key: your agent can create and manage your listings
claude mcp add --transport http saasrow ${siteUrl}/api/mcp \\
  --header "Authorization: Bearer sr_…"`}</Code>
            <p>
              Or in any MCP client config:
            </p>
            <Code>{`{
  "mcpServers": {
    "saasrow": {
      "type": "http",
      "url": "${siteUrl}/api/mcp",
      "headers": { "Authorization": "Bearer sr_…" }
    }
  }
}`}</Code>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <tbody>
                  <Row method="read" path="search_products" what="Filter by text, category, use case, audience, platform, pricing model, or alternative-to." />
                  <Row method="read" path="get_product" what="One product by id." />
                  <Row method="read" path="list_categories" what="Every category with counts." />
                  <Row method="read" path="get_vocabulary" what="The controlled filter terms." />
                  <Row method="write" path="create_listing" what="Submit a free listing for review." />
                  <Row method="write" path="list_my_listings" what="Everything your account owns, any status." />
                  <Row method="write" path="get_my_listing" what="One of yours, any status." />
                  <Row method="write" path="update_listing" what="Change any subset of fields." />
                  <Row method="write" path="delete_listing" what="Permanent." />
                </tbody>
              </table>
            </div>
            <p>
              The server is stateless streamable HTTP. Details at <A href="/api/mcp">/api/mcp</A>.
            </p>
          </Section>

          <Section
            id="api"
            title="REST API"
            lead="Reads need nothing. Writes send an API key as a bearer token. Everything is JSON and CORS-enabled."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <tbody>
                  <Row method="GET" path="/api/v1/products" what="Search and filter approved products. No key." />
                  <Row method="GET" path="/api/v1/products/{id}" what="One product with its JSON-LD. No key." />
                  <Row method="GET" path="/api/v1/categories · /vocabulary · /stats" what="Discovery endpoints. No key." />
                  <Row method="GET" path="/api/v1/me" what="The account behind your key." />
                  <Row method="GET POST" path="/api/v1/listings" what="Your listings, any status; submit a new one." />
                  <Row method="GET PATCH DELETE" path="/api/v1/listings/{id}" what="One of yours." />
                  <Row method="GET POST" path="/api/v1/keys" what="List keys (prefix only); create one, returned once." />
                  <Row method="PATCH DELETE" path="/api/v1/keys/{id}" what="Rename; revoke." />
                  <Row method="POST" path="/api/v1/auth/cli" what="{ email } → we email a code." />
                  <Row method="POST" path="/api/v1/auth/cli/verify" what="{ email, code, key_name } → a new API key." />
                </tbody>
              </table>
            </div>
            <Code>{`curl -X POST ${siteUrl}/api/v1/listings \\
  -H "Authorization: Bearer sr_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Acme Analytics",
    "website": "https://acme.example",
    "description": "Privacy-first product analytics you can self-host.",
    "category": "Analytics",
    "tags": ["analytics", "privacy"],
    "use_cases": ["analytics"],
    "pricing_model": "freemium",
    "alternatives": ["Google Analytics", "Mixpanel"]
  }'`}</Code>
            <p>
              Listing fields: <span className="text-white font-mono">name</span>,{' '}
              <span className="text-white font-mono">website</span> and{' '}
              <span className="text-white font-mono">description</span> are required on create;{' '}
              <span className="text-white font-mono">category</span>,{' '}
              <span className="text-white font-mono">tags</span>,{' '}
              <span className="text-white font-mono">use_cases</span>,{' '}
              <span className="text-white font-mono">audiences</span>,{' '}
              <span className="text-white font-mono">platforms</span>,{' '}
              <span className="text-white font-mono">pricing_model</span> and{' '}
              <span className="text-white font-mono">alternatives</span> are optional. Vocabulary
              terms outside <A href="/api/v1/vocabulary">the closed lists</A> are dropped, never
              rejected. A website that is already listed returns 409. Errors come back as{' '}
              <span className="text-white font-mono">{`{ "error": { "status", "message" } }`}</span>.
            </p>
            <p>
              The full, self-describing index lives at <A href="/api/v1">/api/v1</A>.
            </p>
          </Section>

          <Section
            id="keys"
            title="API keys"
            lead="Make as many as you have machines and agents. Name them, see when each was last used, revoke one without touching the others."
          >
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="text-white">From the CLI:</span>{' '}
                <span className="font-mono text-white">saasrow keys create &quot;name&quot;</span>. The
                first key comes from <span className="font-mono text-white">saasrow login</span>.
              </li>
              <li>
                <span className="text-white">From the website:</span> the API keys panel on your
                listing management page (the link we email you).
              </li>
              <li>
                <span className="text-white">From the API:</span>{' '}
                <span className="font-mono text-white">POST /api/v1/keys</span> with a key you already have.
              </li>
            </ul>
            <p>
              A key looks like <span className="font-mono text-white">sr_</span> followed by 40
              characters. We store only a hash, so the full key is shown exactly once, at creation.
              A key can do everything your management page can for your listings: treat it like a
              password, and revoke it the moment you suspect it leaked.
            </p>
          </Section>

          <Section
            id="accounts"
            title="Accounts"
            lead="No passwords. Proving you can read an inbox is the account."
          >
            <p>
              <span className="font-mono text-white">saasrow login</span> asks for an email, we send
              a one-time code (it expires in 15 minutes and works once), and the code becomes your
              first API key. The same email owns every listing ever submitted with it, including
              ones made on the website, so <span className="font-mono text-white">saasrow listings list</span>{' '}
              shows all of them.
            </p>
            <p>
              Listings created through the API are free, reviewed like any other submission, and
              renewable from the management page. Upgrading to a featured tier still happens on the{' '}
              <A href="/featured">pricing page</A>.
            </p>
          </Section>

          <div className="bg-[#3a3a3a] rounded-2xl p-6 md:p-8 mb-8">
            <h2 className="text-white text-2xl font-bold font-ubuntu mb-3">Also for machines</h2>
            <ul className="text-white/80 font-ubuntu space-y-2">
              <li>
                <A href="/llms.txt">/llms.txt</A> and <A href="/llms-full.txt">/llms-full.txt</A> —
                the directory as markdown for AI assistants
              </li>
              <li>
                <A href="/distribution">/distribution</A> — every channel a listing is published to,
                with measured stats
              </li>
              <li>
                <A href="/api/v1/stats">/api/v1/stats</A> — the counting method behind the numbers
              </li>
            </ul>
          </div>

          <div className="mt-10 text-center">
            <a
              href="https://www.npmjs.com/package/@profullstack/saasrow"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-900 font-bold font-ubuntu text-lg rounded-full px-8 py-4 hover:opacity-90 transition-opacity"
            >
              npx @profullstack/saasrow login
            </a>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}
