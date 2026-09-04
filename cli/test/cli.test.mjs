import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../src/cli.mjs'
import { loadConfig, saveConfig } from '../src/config.mjs'

// End-to-end through `main` with a scripted server. Each handler receives the
// parsed request and returns [status, body].

function fakeServer(routes) {
  const calls = []
  const fetch = async (url, init = {}) => {
    const u = new URL(url)
    const method = init.method ?? 'GET'
    const key = `${method} ${u.pathname}`
    calls.push({ method, path: u.pathname, search: u.search, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined })
    const handler = routes[key]
    if (!handler) return new Response(JSON.stringify({ error: { message: `no route ${key}` } }), { status: 404 })
    const [status, body] = await handler(calls[calls.length - 1])
    return new Response(JSON.stringify(body), { status, statusText: 'x' })
  }
  return { fetch, calls }
}

function harness(routes, { answers = [], env: extraEnv = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'saasrow-cli-'))
  const env = { SAASROW_HOME: dir, SAASROW_API_URL: 'https://api.test', ...extraEnv }
  const server = fakeServer(routes)
  let out = ''
  let err = ''
  const io = {
    env,
    fetch: server.fetch,
    out: (s) => (out += s),
    err: (s) => (err += s),
    prompt: async () => {
      if (answers.length === 0) throw new Error('prompt with no scripted answer')
      return answers.shift()
    },
  }
  return {
    run: (argv) => main(argv, io),
    calls: server.calls,
    env,
    get out() {
      return out
    },
    get err() {
      return err
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

test('help prints and exits 2 with no command, 0 with --help', async () => {
  const h = harness({})
  try {
    assert.equal(await h.run([]), 2)
    assert.match(h.out, /Usage: saasrow/)
    assert.equal(await h.run(['--help']), 0)
  } finally {
    h.cleanup()
  }
})

test('login: sends the code, verifies it, stores the key', async () => {
  const h = harness(
    {
      'POST /api/v1/auth/cli': async () => [200, { ok: true }],
      'POST /api/v1/auth/cli/verify': async (req) => {
        assert.equal(req.body.email, 'me@example.com')
        assert.equal(req.body.code, 'ABCD-2345')
        assert.equal(req.body.key_name, 'My box')
        return [201, { api_key: 'sr_secret', key: { id: 'k1', name: 'My box', prefix: 'sr_secre' }, user: { id: 'u1', email: 'me@example.com' } }]
      },
    },
    { answers: ['me@example.com', 'ABCD-2345'] },
  )
  try {
    assert.equal(await h.run(['login', '--name', 'My box']), 0)
    assert.match(h.out, /Logged in as me@example.com/)
    assert.equal(h.calls[0].headers.Authorization, undefined, 'login must not send a stale key')
    const cfg = loadConfig(h.env)
    assert.equal(cfg.apiKey, 'sr_secret')
    assert.equal(cfg.email, 'me@example.com')
    assert.equal(cfg.keyId, 'k1')
  } finally {
    h.cleanup()
  }
})

test('login surfaces the server message when the code is wrong', async () => {
  const h = harness(
    {
      'POST /api/v1/auth/cli': async () => [200, { ok: true }],
      'POST /api/v1/auth/cli/verify': async () => [401, { error: { status: 401, message: 'Incorrect code.' } }],
    },
    { answers: ['me@example.com', 'WRONG-ONE'] },
  )
  try {
    assert.equal(await h.run(['login']), 1)
    assert.match(h.err, /Incorrect code\./)
    assert.deepEqual(loadConfig(h.env), {})
  } finally {
    h.cleanup()
  }
})

test('authenticated commands refuse to run without a key', async () => {
  const h = harness({})
  try {
    assert.equal(await h.run(['listings', 'list']), 2)
    assert.match(h.err, /saasrow login/)
    assert.equal(h.calls.length, 0)
  } finally {
    h.cleanup()
  }
})

test('the stored key is sent as a bearer token', async () => {
  const h = harness({
    'GET /api/v1/me': async (req) => {
      assert.equal(req.headers.Authorization, 'Bearer sr_stored')
      return [200, { user: { email: 'me@example.com' }, authenticated_via: 'api_key', key_id: 'k1' }]
    },
  })
  try {
    saveConfig({ apiKey: 'sr_stored' }, h.env)
    assert.equal(await h.run(['whoami']), 0)
    assert.match(h.out, /me@example.com/)
  } finally {
    h.cleanup()
  }
})

test('SAASROW_API_KEY beats the stored key', async () => {
  const h = harness(
    {
      'GET /api/v1/me': async (req) => {
        assert.equal(req.headers.Authorization, 'Bearer sr_env')
        return [200, { user: { email: 'ci@example.com' }, authenticated_via: 'api_key', key_id: null }]
      },
    },
    { env: { SAASROW_API_KEY: 'sr_env' } },
  )
  try {
    saveConfig({ apiKey: 'sr_stored' }, h.env)
    assert.equal(await h.run(['whoami', '--json']), 0)
    assert.equal(JSON.parse(h.out).user.email, 'ci@example.com')
  } finally {
    h.cleanup()
  }
})

test('listings create posts the mapped body and prints the summary', async () => {
  const h = harness(
    {
      'POST /api/v1/listings': async (req) => {
        assert.deepEqual(req.body, { name: 'Acme', website: 'https://acme.example', description: 'd', tags: ['a', 'b'] })
        return [201, { data: { id: 'l1', name: 'Acme', website: 'https://acme.example', status: 'pending', description: 'd', tags: ['a', 'b'] }, message: 'Listing submitted.' }]
      },
    },
    { env: { SAASROW_API_KEY: 'sr_env' } },
  )
  try {
    const code = await h.run(['listings', 'create', '--name', 'Acme', '--website', 'https://acme.example', '--description', 'd', '--tags', 'a,b'])
    assert.equal(code, 0)
    assert.match(h.out, /Acme {2}\[pending\]/)
    assert.match(h.err, /Listing submitted/)
  } finally {
    h.cleanup()
  }
})

test('keys revoke resolves a prefix and asks before revoking', async () => {
  const h = harness(
    {
      'GET /api/v1/keys': async () => [200, { data: [{ id: '11111111-1111-4111-8111-111111111111', prefix: 'sr_abcd1234', name: 'Laptop', active: true }] }],
      'DELETE /api/v1/keys/11111111-1111-4111-8111-111111111111': async () => [200, { data: { prefix: 'sr_abcd1234', name: 'Laptop' }, revoked_current_key: false }],
    },
    { answers: ['y'], env: { SAASROW_API_KEY: 'sr_env' } },
  )
  try {
    assert.equal(await h.run(['keys', 'revoke', 'sr_abcd1234']), 0)
    assert.match(h.out, /Revoked sr_abcd1234/)
  } finally {
    h.cleanup()
  }
})

test('keys revoke --yes skips the prompt; declining exits 1', async () => {
  const h = harness(
    {
      'DELETE /api/v1/keys/11111111-1111-4111-8111-111111111111': async () => [200, { data: { prefix: 'sr_x', name: 'n' } }],
    },
    { answers: ['n'], env: { SAASROW_API_KEY: 'sr_env' } },
  )
  try {
    assert.equal(await h.run(['keys', 'revoke', '11111111-1111-4111-8111-111111111111']), 1)
    assert.match(h.err, /Cancelled/)
    assert.equal(await h.run(['keys', 'revoke', '11111111-1111-4111-8111-111111111111', '--yes']), 0)
  } finally {
    h.cleanup()
  }
})

test('search is unauthenticated and forwards filters as query params', async () => {
  const h = harness({
    'GET /api/v1/products': async (req) => {
      assert.equal(req.headers.Authorization, undefined)
      assert.equal(req.search, '?q=analytics&pricing_model=free&limit=5')
      return [200, { data: [{ id: 'p1', name: 'Tool', category: 'Analytics', pricing_model: 'free', website: 'https://t.example' }], pagination: { total: 1, offset: 0, limit: 5, next: null } }]
    },
  })
  try {
    saveConfig({ apiKey: 'sr_stored' }, h.env)
    assert.equal(await h.run(['search', 'analytics', '--pricing-model', 'free', '--limit', '5']), 0)
    assert.match(h.out, /Tool/)
  } finally {
    h.cleanup()
  }
})

test('a 401 from the server hints at logging in again', async () => {
  const h = harness(
    { 'GET /api/v1/listings': async () => [401, { error: { status: 401, message: 'Authentication required.' } }] },
    { env: { SAASROW_API_KEY: 'sr_dead' } },
  )
  try {
    assert.equal(await h.run(['listings', 'list']), 1)
    assert.match(h.err, /\(401\): Authentication required/)
    assert.match(h.err, /saasrow login/)
  } finally {
    h.cleanup()
  }
})
