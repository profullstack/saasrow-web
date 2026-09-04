# Distribution layer

A listing on SaaSRow is published to five channels at once. This document
describes each one, where its code lives, and how to verify it.

The design goal is that everything a human can see, a machine can fetch —
without an API key, a signup, or a paywall. Writing (creating and managing
your own listings) needs an account; see [Accounts and API keys](#accounts-and-api-keys).

## Channels

| Channel | Entry point | Code |
| --- | --- | --- |
| Search engines | `/sitemap.xml`, JSON-LD on every page | `app/sitemap.ts`, `src/lib/structuredData.ts` |
| AI assistants | `/llms.txt`, `/llms-full.txt`, `/software/{id}/markdown` | `src/lib/markdownExport.ts` |
| Public API | `/api/v1` | `app/api/v1/**`, `src/lib/distribution.ts` |
| MCP server | `/api/mcp` | `src/lib/mcpServer.ts` |
| CLI | `npx @profullstack/saasrow` | `cli/` |
| Marketing page | `/distribution` | `src/views/Distribution.tsx` |

All four data transports read through one query layer,
`src/lib/distribution.ts`, so they cannot disagree about what an approved
listing is or which columns are publishable. The write side goes through
`src/lib/listings.ts` the same way: the REST routes, the MCP write tools and
the CLI are three transports over one implementation.

## Accounts and API keys

There are no passwords. An account is an email address that has proved it can
read its inbox, which is how the website's management links already work.
The row is `users` (unique on email).

An API key is `sr_` plus 40 characters from an unambiguous alphabet. Only its
SHA-256 hash is stored (`api_keys.key_hash`); the first 11 characters are kept
as `key_prefix` so a user can tell keys apart. The plaintext is returned once,
at creation, and never again. Revoking sets `revoked_at` rather than deleting,
so `last_used_at` history survives. `api_keys` and `cli_login_codes` have RLS
on with no policies: only the service role, i.e. only server code that has
already authenticated the caller, can touch them.

Two credentials are accepted on every authenticated route
(`src/lib/apiAuth.ts`):

- `Authorization: Bearer sr_…` — an API key. CLI, MCP, scripts.
- `X-Management-Token: …` — the token from a `/manage/{token}` link, so the
  website's manage page can drive the same key endpoints. Resolves either a
  `user_tokens.token` or a `software_submissions.management_token`; a legacy
  listing with no `user_id` is adopted by its contact email's user on the way.

### `saasrow login`

1. `POST /api/v1/auth/cli {email}` → the Next route forwards to the
   `cli-login` edge function, which generates an `XXXX-XXXX` code, stores
   `sha256("email:CODE")` in `cli_login_codes` (15-minute expiry, five codes
   per email per hour) and emails it via Resend. The edge function does this
   because only edge functions hold `RESEND_API_KEY`.
2. `POST /api/v1/auth/cli/verify {email, code, key_name}` → the Next route
   checks the newest live code (five wrong guesses kill it), consumes it,
   upserts `users`, creates a key and returns the plaintext once.

The hashing rule is duplicated in `src/lib/apiKeys.ts` and
`supabase/functions/cli-login/index.ts`; `__tests__/lib/apiKeys.test.ts`
pins the vector.

### Authenticated endpoints

| Route | Methods | What |
| --- | --- | --- |
| `/api/v1/me` | GET | The account behind the credential |
| `/api/v1/keys` | GET, POST | List keys (prefixes only); create one |
| `/api/v1/keys/{id}` | PATCH, DELETE | Rename; revoke |
| `/api/v1/listings` | GET, POST | Everything you own, any status; submit a free listing |
| `/api/v1/listings/{id}` | GET, PATCH, DELETE | One of yours |

A listing created here is byte-for-byte what the website's submit form
produces: `status = pending`, `tier = free`, a fresh `management_token`, a
`submission_contacts` row, and the `send-admin-notification` call. Input is
validated by `src/lib/listingInput.ts` (pure, unit-tested); vocabulary terms
outside the closed lists are dropped, not rejected, exactly as on the site.
One account may hold at most 25 pending listings.

The MCP server exposes the same operations as `create_listing`,
`list_my_listings`, `get_my_listing`, `update_listing` and `delete_listing`.
They appear in `tools/list` for everyone and return a tool error explaining
how to connect with a key when called without one, so a client with a stale
key keeps its read tools.

### The CLI

`cli/` is a separate zero-dependency package, `@profullstack/saasrow`, in the
same shape as `@profullstack/timer` and `@profullstack/billing`: plain Node
ESM, `node --test`, `bin/saasrow.mjs`. Credentials live in
`~/.profullstack/saasrow/config.json` (0600) or `SAASROW_API_KEY`. It is
excluded from the root vitest run and tested with `cd cli && npm test`.
Publish from `cli/` with `npm publish --access public` once the API is live.

## Structured vocabulary

Free-text tags are good for humans and bad for agents: `b2b`, `B2B` and
`business-to-business` are three strings for one idea. Five columns on
`software_submissions` carry closed vocabularies instead:

- `use_cases` — what the product is for (max 5)
- `audiences` — who it is for (max 4)
- `platforms` — where it runs
- `pricing_model` — a single term
- `alternatives` — competitor product names (free text, max 10)

The canonical term lists live in `src/lib/vocab.ts` and are served at
`/api/v1/vocabulary`.

### The duplicated copy

Supabase edge functions run on Deno and cannot import from the Next.js source
tree, so `supabase/functions/_shared/vocab.ts` holds a second copy of the term
lists. `__tests__/lib/vocabDrift.test.ts` parses both files and fails if they
diverge — **if you add a term, add it in both places** and that test will
confirm you did.

### Case-insensitive "alternative to"

`alternatives_lc` is a stored generated column holding the lowercased names,
maintained by the immutable `public.lower_text_array()` function and backed by
a GIN index. It exists so `?alternative_to=Notion` matches a listing that typed
`notion`, without a sequential scan.

## Honest stats

`/api/v1/stats` and the counters on `/distribution` are counted events, not
estimates, and each response states its own counting method.

`public.ai_reads` gets one row per request from a recognised AI crawler
user-agent (see `src/lib/aiClients.ts`) or from any public API / MCP client.
Ordinary browser traffic is **not** counted: an unrecognised user-agent on the
crawler channel is discarded rather than attributed.

No IP address and no raw user-agent string is stored — only the bot family we
matched — which keeps the table clear of personal data. Writes are
fire-and-forget; a telemetry failure never fails the request that triggered it.

## Verifying

```bash
# Unit tests (pure logic: vocabulary, JSON-LD, markdown, MCP protocol)
npx vitest run __tests__/lib

# End-to-end against real data
doppler run -p saasrow -c prd -- npm run build
doppler run -p saasrow -c prd -- npx next start -p 3117

curl "localhost:3117/api/v1/products?use_case=analytics&pricing_model=free"
curl "localhost:3117/llms.txt"
curl -X POST localhost:3117/api/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Note that `__tests__/api/*` are live-integration tests requiring Supabase
credentials; they fail in a bare checkout and are unrelated to this layer.

## Backfill

The 302 listings that predate the vocabulary were backfilled deterministically
from their existing `category` and `tags` by
`supabase/migrations/20260813140000_backfill_vocabulary_from_tags.sql` —
every term comes from an explicit mapping in that file, nothing is guessed, and
a listing with no confident mapping is left NULL. Absent data beats wrong data
when an assistant is going to repeat it as fact.

Coverage: `use_cases` 214, `platforms` 70, `pricing_model` 20, `audiences` 29.
The remaining gaps are mostly the generic `Software` category, which is too
vague to imply a use case.

The migration only touches rows where all four columns are still NULL, so it is
idempotent and will never overwrite a value a maker set themselves.

## Deploying

Merging does **not** deploy edge functions on this project. After changing
`supabase/functions/submissions`, deploy it explicitly (Supabase MCP, project
ref `yfkuksfqyddufusonyuf`) — and pass `verify_jwt: false`, which is what this
function runs with; the deploy tool defaults to `true` and would break it.

Because the entrypoint imports `../_shared/vocab.ts`, deploy both files with
their repo-relative paths (`submissions/index.ts` and `_shared/vocab.ts`) and
set the entrypoint to `submissions/index.ts`, or the import will not resolve.

Already applied to production as of 2026-08-13: both migrations, and version 85
of the `submissions` function.

## Connecting the MCP server

```bash
claude mcp add --transport http saasrow https://www.saasrow.com/api/mcp
```

The server is stateless (no session id, no SSE stream), which is a legal
subset of streamable HTTP and means any instance can serve any request.
