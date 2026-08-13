# Distribution layer

A listing on SaaSRow is published to five channels at once. This document
describes each one, where its code lives, and how to verify it.

The design goal is that everything a human can see, a machine can fetch —
without an API key, a signup, or a paywall.

## Channels

| Channel | Entry point | Code |
| --- | --- | --- |
| Search engines | `/sitemap.xml`, JSON-LD on every page | `app/sitemap.ts`, `src/lib/structuredData.ts` |
| AI assistants | `/llms.txt`, `/llms-full.txt`, `/software/{id}/markdown` | `src/lib/markdownExport.ts` |
| Public API | `/api/v1` | `app/api/v1/**`, `src/lib/distribution.ts` |
| MCP server | `/api/mcp` | `src/lib/mcpServer.ts` |
| Marketing page | `/distribution` | `src/views/Distribution.tsx` |

All four data transports read through one query layer,
`src/lib/distribution.ts`, so they cannot disagree about what an approved
listing is or which columns are publishable.

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
