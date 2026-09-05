# Listing assets: logo, image, screenshots

Every approved listing should have a logo, an image and at least one
screenshot, whatever its tier. This document describes how that is
guaranteed, what to run when it is not, and why the old path silently did
nothing.

## What was wrong (2026-09-04)

- Screenshot capture ran only for `featured`/`premium` listings, at two
  separate gates (`admin-submissions` and `capture-screenshots`). Every
  listing in the database is `free`, so no listing ever had a screenshot.
- The Rasterwise screenshot API behind `GETSCREENSHOT_API_KEY` returns
  `500 {"message":"error"}` for every URL, so even paid listings would have
  got nothing.
- The deployed `fetch-metadata` looked for a ScreenshotOne key
  (`SCREENSHOT_API_KEY`) that was never configured.
- Nothing ever backfilled a logo or og:image after submission: 52 approved
  listings had no logo and 131 had no image.
- Unrelated but visible in the same logs: the OpenAI key has no credits, so
  `fetch-metadata` fell back to the raw page `<title>` and meta description
  instead of the AI-written title/description/category/tags. Since
  2026-09-05 `generateWithAI` tries OpenAI, then Gemini 2.5 Flash
  (`GEMINI_API_KEY`, the account-level key from the shared vault), then page
  metadata, so submissions get model-written copy again without OpenAI
  credits. Add credits at
  https://platform.openai.com/settings/organization/billing/overview and
  OpenAI takes over again automatically.

## How it works now

One implementation, `supabase/functions/_shared/listingAssets.ts`, with no
runtime-specific imports so it runs in Deno and in Node:

- `extractAssetUrls(html, url)` — best favicon (largest PNG/SVG or
  apple-touch-icon, `data:` icons included, else `/favicon.ico`), `og:image`
  (or `twitter:image`), and same-origin top navigation links.
- `findLogo(declared, url)` — a ladder: the declared icon, well-known paths
  (the page's own directory first, for sites under a subpath, then
  `/favicon.ico`, `/favicon.png`, `/apple-touch-icon.png`, …), the
  DuckDuckGo icon service, then Google's favicon service with its generic
  "unknown site" placeholder detected by hash and rejected.
- `monogramLogo(title, url)` — the last resort: an SVG with the product's
  first letter on a colour hashed from the domain. Obviously a placeholder;
  a maker replaces it by uploading a logo on the management page. After the
  2026-09-05 run every approved listing has a logo (6 of the 15 stragglers
  came from the ladder, 9 are monograms).
- `captureScreenshot(url, env)` — a provider chain: ScreenshotOne if
  `SCREENSHOT_API_KEY` is set, Rasterwise if `GETSCREENSHOT_API_KEY` is set,
  then the keyless public Microlink and thum.io services. Every result is
  byte-sniffed; an HTML error page with an image content-type is rejected.
  Adding a paid key makes it first in line with no code change.
- `completeListingAssets(db, row, { screenshot })` — fills only what is
  missing: favicon → `logo`, og:image → `image`, homepage screenshot (plus
  up to three nav pages for paid tiers) → `submission_screenshots`. With no
  og:image the homepage screenshot becomes the `image`. Always stamps
  `software_submissions.assets_checked_at`, even on failure, so a site with
  nothing to give is not retried every sweep.

Three callers:

| Caller | When | Screenshot source |
| --- | --- | --- |
| `admin-submissions` → `complete-listing` `{submissionId}` | every approval, any tier, after the response via `EdgeRuntime.waitUntil` | provider chain |
| pg_cron `complete-listing-sweep` → `complete-listing` `{batch: 3}` | every 10 minutes | provider chain |
| `scripts/backfill-listing-assets.mjs` | by hand, for bulk work | local headless Chrome, chain as fallback |

`listings_needing_assets(max_rows, cooldown)` (SQL, security definer, service
role only) is the single definition of "incomplete": approved, not checked
within the cooldown (default 14 days), and missing a logo, an image or any
screenshot. Both the sweep and the script call it.

`complete-listing` is deployed with `verify_jwt: false` because the anon key
in this project is a publishable key, not a JWT, and pg_cron has nothing
else to send. It bounds unauthenticated callers instead: one run per
listing per hour, batches of at most three and no more often than every
four minutes. `X-Admin-Token` lifts both limits (batch ≤ 10).

`capture-screenshots` (the manual button on the management page, paid tiers
only) now deletes the gallery and rebuilds it through the same code.

## Running the backfill

```bash
doppler run -p saasrow -c prd -- node scripts/backfill-listing-assets.mjs [--limit N] [--concurrency 3] [--dry-run]
```

Node 24 (strips the types from the shared `.ts` on import). On the dev box
Chrome comes from `~/.cache/puppeteer/chrome/*` and needs the staged runtime
libs in `~/.local/share/chrome-deps`; the script sets `LD_LIBRARY_PATH` and
`FONTCONFIG_FILE` itself. `CHROME_PATH` overrides the binary. Roughly three
listings per ten seconds at concurrency 3.

Run 2026-09-04 against all 417 approved listings; see the PR for the tally.

## Verifying

```bash
npx vitest run __tests__/functions          # extractor, sniffing, chain, completion
curl -X POST https://yfkuksfqyddufusonyuf.supabase.co/functions/v1/complete-listing \
  -H 'Content-Type: application/json' -d '{"submissionId":"<uuid>"}'
```

```sql
select count(*) filter (where logo is null) no_logo,
       count(*) filter (where image is null) no_image,
       count(*) filter (where not exists (select 1 from submission_screenshots s where s.submission_id = ss.id)) no_shots
from software_submissions ss where status = 'approved';
select * from cron.job_run_details order by start_time desc limit 5;
```

## Deploying

As with every edge function here, merging deploys nothing. The dev box's
Supabase CLI is logged in (token `saasrow-cli`, since 2026-09-05), so deploy
from the repo root and the shared import resolves on its own:

```bash
supabase functions deploy complete-listing   --project-ref yfkuksfqyddufusonyuf --no-verify-jwt
supabase functions deploy capture-screenshots --project-ref yfkuksfqyddufusonyuf --no-verify-jwt
supabase functions deploy admin-submissions  --project-ref yfkuksfqyddufusonyuf --no-verify-jwt
```

Redeploy `complete-listing` and `capture-screenshots` whenever
`_shared/listingAssets.ts` changes (`admin-submissions` does not import it).
Migrations `add_assets_checked_at` and `schedule_complete_listing_sweep` are
applied. `GETSCREENSHOT_API_KEY` in the edge secrets is the renewed Rasterwise
key (2026-09-05); the same value is in Doppler `saasrow/prd` and the logicsrc
vaults `saasrow-web--prod` and `profullstack-sharable-keys--prod`.
