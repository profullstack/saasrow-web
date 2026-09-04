// Command dispatch. `main(argv, io)` returns an exit code and writes only to
// the streams it is given, so the whole CLI runs under test with a fake fetch
// and a scripted prompt.

import { hostname } from 'node:os'
import { parseArgs } from './args.mjs'
import { createClient, ApiClientError, VERSION } from './client.mjs'
import {
  loadConfig,
  saveConfig,
  clearConfig,
  configPath,
  resolveApiKey,
  resolveApiUrl,
} from './config.mjs'
import { json, table, date, listingSummary } from './format.mjs'
import { ask } from './prompt.mjs'
import { listingBodyFromFlags, LISTING_FLAG_HELP } from './listing-flags.mjs'

const HELP = `saasrow ${VERSION} — the saasrow.com directory from your terminal

Usage: saasrow <command> [options]

Account
  login [--email <e>] [--name <key name>]   sign in with an emailed code; creates an API key
  logout [--revoke]                         forget the local key (and revoke it on the server)
  whoami                                    which account the current key belongs to

Listings (require login)
  listings list
  listings get <id>
  listings create --name … --website … --description … [more flags]
  listings update <id> [flags]
  listings delete <id> [--yes]

API keys (require login)
  keys list [--all]                         active keys; --all includes revoked
  keys create <name>                        prints the new key once
  keys rename <id|prefix> <name>
  keys revoke <id|prefix> [--yes]

Directory (no login needed)
  search <query> [--category …] [--use-case …] [--audience …] [--platform …]
                 [--pricing-model …] [--alternative-to …] [--sort recent|popular|views] [--limit n]
  categories
  vocabulary

Listing fields for create/update
${LISTING_FLAG_HELP}

Global options
  --json           print the raw API response
  --api-url <url>  talk to a different server (or SAASROW_API_URL)
  -h, --help       this text
  -v, --version    print the version

Credentials are stored in ${configPath()} (override with SAASROW_HOME).
SAASROW_API_KEY in the environment wins over the stored key.
`

class UsageError extends Error {}

function needKey(client) {
  if (!client.hasKey) {
    throw new UsageError('Not logged in. Run `saasrow login`, or set SAASROW_API_KEY.')
  }
}

async function confirm(io, question, flags) {
  if (flags.yes) return true
  const answer = await io.prompt(`${question} [y/N] `)
  return /^y(es)?$/i.test(answer)
}

// ---------------------------------------------------------------------------

async function login({ client, flags, io, env }) {
  const email = flags.email || (await io.prompt('Email: '))
  if (!email || !email.includes('@')) throw new UsageError('An email address is required.')

  await client.post('/api/v1/auth/cli', { email }, { auth: false })
  io.err(`We emailed a login code to ${email}. It expires in 15 minutes.\n`)

  const code = flags.code || (await io.prompt('Code: '))
  if (!code) throw new UsageError('No code entered.')

  const keyName = flags.name || `${hostname()} CLI`
  const result = await client.post(
    '/api/v1/auth/cli/verify',
    { email, code, key_name: keyName },
    { auth: false },
  )

  const config = loadConfig(env)
  const next = {
    ...config,
    apiKey: result.api_key,
    email: result.user.email,
    keyId: result.key.id,
    keyPrefix: result.key.prefix,
  }
  if (flags['api-url']) next.apiUrl = String(flags['api-url']).replace(/\/+$/, '')
  const path = saveConfig(next, env)

  if (flags.json) {
    io.out(json({ email: result.user.email, key: result.key, config: path }))
  } else {
    io.out(`Logged in as ${result.user.email}. Key "${result.key.name}" (${result.key.prefix}…) saved to ${path}.\n`)
  }
  return 0
}

async function logout({ client, flags, io, env }) {
  const config = loadConfig(env)
  if (flags.revoke && config.keyId && client.hasKey) {
    try {
      await client.delete(`/api/v1/keys/${config.keyId}`)
      io.err(`Revoked key ${config.keyPrefix ?? config.keyId}… on the server.\n`)
    } catch (err) {
      io.err(`Could not revoke the key on the server: ${err.message}\n`)
    }
  }
  const path = clearConfig(env)
  io.out(`Logged out. Removed ${path}.\n`)
  if (!flags.revoke) io.err('The key still works elsewhere; use `saasrow logout --revoke` to kill it.\n')
  return 0
}

async function whoami({ client, flags, io }) {
  needKey(client)
  const me = await client.get('/api/v1/me')
  if (flags.json) io.out(json(me))
  else io.out(`${me.user.email} (via ${me.authenticated_via}${me.key_id ? `, key ${me.key_id}` : ''})\n`)
  return 0
}

// ---------------------------------------------------------------------------

async function resolveKeyId(client, idOrPrefix) {
  if (/^[0-9a-f-]{36}$/i.test(idOrPrefix)) return idOrPrefix
  const { data } = await client.get('/api/v1/keys')
  const matches = data.filter((k) => k.active && (k.prefix === idOrPrefix || k.id.startsWith(idOrPrefix)))
  if (matches.length === 1) return matches[0].id
  if (matches.length > 1) throw new UsageError(`"${idOrPrefix}" matches more than one key; use the full id.`)
  throw new UsageError(`No active key matches "${idOrPrefix}".`)
}

async function keys({ client, positionals, flags, io }) {
  needKey(client)
  const [sub, ...rest] = positionals
  switch (sub ?? 'list') {
    case 'list':
    case 'ls': {
      const { data } = await client.get('/api/v1/keys')
      const rows = flags.all ? data : data.filter((k) => k.active)
      if (flags.json) return io.out(json(rows)), 0
      if (rows.length === 0) return io.out('No active API keys.\n'), 0
      io.out(
        table(rows, [
          { key: 'prefix', label: 'PREFIX' },
          { key: 'name', label: 'NAME', max: 40 },
          { key: (k) => date(k.created_at), label: 'CREATED' },
          { key: (k) => date(k.last_used_at), label: 'LAST USED' },
          { key: (k) => (k.active ? 'active' : 'revoked'), label: 'STATUS' },
          { key: 'id', label: 'ID' },
        ]),
      )
      return 0
    }
    case 'create': {
      const name = rest.join(' ').trim()
      if (!name) throw new UsageError('Usage: saasrow keys create <name>')
      const created = await client.post('/api/v1/keys', { name })
      if (flags.json) return io.out(json(created)), 0
      io.out(`${created.api_key}\n`)
      io.err(`Created key "${created.key.name}" (${created.key.prefix}…). This is the only time it is shown.\n`)
      return 0
    }
    case 'rename': {
      const [id, ...nameParts] = rest
      const name = nameParts.join(' ').trim()
      if (!id || !name) throw new UsageError('Usage: saasrow keys rename <id|prefix> <name>')
      const keyId = await resolveKeyId(client, id)
      const { data } = await client.patch(`/api/v1/keys/${keyId}`, { name })
      if (flags.json) return io.out(json(data)), 0
      io.out(`Renamed ${data.prefix}… to "${data.name}".\n`)
      return 0
    }
    case 'revoke':
    case 'delete':
    case 'rm': {
      const [id] = rest
      if (!id) throw new UsageError('Usage: saasrow keys revoke <id|prefix>')
      const keyId = await resolveKeyId(client, id)
      if (!(await confirm(io, `Revoke key ${keyId}? Anything using it stops working immediately.`, flags))) {
        return io.err('Cancelled.\n'), 1
      }
      const result = await client.delete(`/api/v1/keys/${keyId}`)
      if (flags.json) return io.out(json(result)), 0
      io.out(`Revoked ${result.data.prefix}… ("${result.data.name}").\n`)
      if (result.revoked_current_key) io.err('That was the key this CLI is using; run `saasrow login` again.\n')
      return 0
    }
    default:
      throw new UsageError(`Unknown keys command "${sub}". Try: list, create, rename, revoke.`)
  }
}

// ---------------------------------------------------------------------------

async function listings({ client, positionals, flags, io }) {
  needKey(client)
  const [sub, ...rest] = positionals
  switch (sub ?? 'list') {
    case 'list':
    case 'ls': {
      const { data } = await client.get('/api/v1/listings')
      if (flags.json) return io.out(json(data)), 0
      if (data.length === 0) return io.out('No listings yet. Create one with `saasrow listings create`.\n'), 0
      io.out(
        table(data, [
          { key: 'status', label: 'STATUS' },
          { key: 'name', label: 'NAME', max: 32 },
          { key: 'website', label: 'WEBSITE', max: 40 },
          { key: 'category', label: 'CATEGORY', max: 20 },
          { key: (l) => date(l.created_at), label: 'CREATED' },
          { key: 'id', label: 'ID' },
        ]),
      )
      return 0
    }
    case 'get':
    case 'show': {
      const [id] = rest
      if (!id) throw new UsageError('Usage: saasrow listings get <id>')
      const { data } = await client.get(`/api/v1/listings/${id}`)
      io.out(flags.json ? json(data) : listingSummary(data))
      return 0
    }
    case 'create':
    case 'add': {
      const body = listingBodyFromFlags(flags, { readStdin: io.readStdin })
      if (Object.keys(body).length === 0) {
        throw new UsageError(`Usage: saasrow listings create --name … --website … --description …\n${LISTING_FLAG_HELP}`)
      }
      const result = await client.post('/api/v1/listings', body)
      if (flags.json) return io.out(json(result.data)), 0
      io.out(listingSummary(result.data))
      io.err(`${result.message}\n`)
      return 0
    }
    case 'update':
    case 'edit': {
      const [id] = rest
      if (!id) throw new UsageError('Usage: saasrow listings update <id> [flags]')
      const body = listingBodyFromFlags(flags, { readStdin: io.readStdin })
      if (Object.keys(body).length === 0) throw new UsageError(`Nothing to update. Fields:\n${LISTING_FLAG_HELP}`)
      const { data } = await client.patch(`/api/v1/listings/${id}`, body)
      io.out(flags.json ? json(data) : listingSummary(data))
      return 0
    }
    case 'delete':
    case 'rm': {
      const [id] = rest
      if (!id) throw new UsageError('Usage: saasrow listings delete <id>')
      if (!(await confirm(io, `Permanently delete listing ${id}?`, flags))) return io.err('Cancelled.\n'), 1
      const result = await client.delete(`/api/v1/listings/${id}`)
      if (flags.json) return io.out(json(result)), 0
      io.out(`Deleted ${id}.\n`)
      return 0
    }
    default:
      throw new UsageError(`Unknown listings command "${sub}". Try: list, get, create, update, delete.`)
  }
}

// ---------------------------------------------------------------------------

async function search({ client, positionals, flags, io }) {
  const query = {
    q: positionals.join(' ') || undefined,
    category: flags.category,
    use_case: flags['use-case'],
    audience: flags.audience,
    platform: flags.platform,
    pricing_model: flags['pricing-model'],
    alternative_to: flags['alternative-to'],
    tag: flags.tag,
    sort: flags.sort,
    limit: flags.limit,
    offset: flags.offset,
  }
  const result = await client.get('/api/v1/products', { query, auth: false })
  if (flags.json) return io.out(json(result)), 0
  if (result.data.length === 0) return io.out('No products matched.\n'), 0
  io.out(
    table(result.data, [
      { key: 'name', label: 'NAME', max: 32 },
      { key: 'category', label: 'CATEGORY', max: 20 },
      { key: 'pricing_model', label: 'PRICING' },
      { key: 'website', label: 'WEBSITE', max: 44 },
      { key: 'id', label: 'ID' },
    ]),
  )
  const { total, offset, limit } = result.pagination
  if (total > offset + limit) io.err(`Showing ${offset + 1}-${offset + result.data.length} of ${total}; use --offset ${offset + limit} for more.\n`)
  return 0
}

async function categories({ client, flags, io }) {
  const result = await client.get('/api/v1/categories', { auth: false })
  const rows = result.data ?? result.categories ?? result
  if (flags.json) return io.out(json(result)), 0
  io.out(table(rows, [{ key: 'name', label: 'CATEGORY' }, { key: 'count', label: 'PRODUCTS' }]))
  return 0
}

async function vocabulary({ client, flags, io }) {
  const result = await client.get('/api/v1/vocabulary', { auth: false })
  if (flags.json) return io.out(json(result)), 0
  const vocab = result.data ?? result
  for (const [group, terms] of Object.entries(vocab)) {
    if (!Array.isArray(terms)) continue
    io.out(`${group}\n  ${terms.join(', ')}\n\n`)
  }
  return 0
}

const COMMANDS = { login, logout, whoami, keys, listings, search, categories, vocabulary }

/**
 * @param {string[]} argv
 * @param {object} io  { out, err, prompt, readStdin, env, fetch }
 */
export async function main(argv, io = {}) {
  const env = io.env ?? process.env
  const out = io.out ?? ((s) => process.stdout.write(s))
  const err = io.err ?? ((s) => process.stderr.write(s))
  const prompt = io.prompt ?? ask
  const { positionals, flags } = parseArgs(argv)
  const [command, ...rest] = positionals

  if (flags.version) return out(`${VERSION}\n`), 0
  if (flags.help) return out(HELP), 0
  if (!command) return out(HELP), 2

  const handler = COMMANDS[command]
  if (!handler) {
    err(`Unknown command "${command}".\n\n${HELP}`)
    return 2
  }

  const config = loadConfig(env)
  const client = createClient({
    baseUrl: resolveApiUrl(flags, env, config),
    apiKey: resolveApiKey(env, config),
    fetch: io.fetch ?? globalThis.fetch,
  })

  try {
    return await handler({ client, positionals: rest, flags, io: { out, err, prompt, readStdin: io.readStdin }, env })
  } catch (error) {
    if (error instanceof UsageError) {
      err(`${error.message}\n`)
      return 2
    }
    if (error instanceof ApiClientError) {
      err(`Error${error.status ? ` (${error.status})` : ''}: ${error.message}\n`)
      if (error.status === 401) err('Run `saasrow login` to get a fresh key.\n')
      return 1
    }
    err(`Error: ${error.message}\n`)
    return 1
  }
}
