// Fill a listing's missing logo, image and screenshots.
//
// Called three ways:
//  - by `admin-submissions` right after an approval, with { submissionId }
//    (kept alive with EdgeRuntime.waitUntil so the approve returns at once);
//  - by the pg_cron sweep every ten minutes with { batch: 3 }, which catches
//    anything the approve-time run missed (site was down, provider failed);
//  - by an admin with X-Admin-Token, for bigger batches.
//
// The endpoint is reachable without a JWT, so unauthenticated callers are
// bounded: one listing per hour each, and batch mode no more often than the
// cron itself runs. Screenshots come from the provider chain in
// ../_shared/listingAssets.ts.

import { createClient } from 'npm:@supabase/supabase-js@2.76.1'
import { captureScreenshot, completeListingAssets, type CompletionResult } from '../_shared/listingAssets.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Token',
}

const ROW_COLUMNS = 'id, url, title, tier, logo, image, status, assets_checked_at'
const SINGLE_COOLDOWN_MS = 60 * 60 * 1000
const BATCH_THROTTLE_MS = 4 * 60 * 1000
/** Stop starting new listings in a batch after this long, to stay inside the function's wall clock. */
const BATCH_BUDGET_MS = 100 * 1000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const env = {
      SCREENSHOT_API_KEY: Deno.env.get('SCREENSHOT_API_KEY'),
      GETSCREENSHOT_API_KEY: Deno.env.get('GETSCREENSHOT_API_KEY'),
    }
    const body = await req.json().catch(() => ({}))

    let admin = false
    const adminToken = req.headers.get('X-Admin-Token')
    if (adminToken) {
      const { data } = await supabase
        .from('admin_tokens')
        .select('email')
        .eq('token', adminToken)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      admin = Boolean(data)
    }

    const screenshot = (url: string) =>
      captureScreenshot(url, env, { log: (m) => console.log('[screenshot]', m) })
    const complete = (row: Parameters<typeof completeListingAssets>[1]) =>
      completeListingAssets(supabase, row, { screenshot, log: (m) => console.log('[complete-listing]', m) })

    if (typeof body.submissionId === 'string' && body.submissionId) {
      const { data: row } = await supabase
        .from('software_submissions')
        .select(ROW_COLUMNS)
        .eq('id', body.submissionId)
        .maybeSingle()
      if (!row) return json({ error: 'No such submission' }, 404)
      if (row.status !== 'approved') return json({ skipped: 'not approved', id: row.id })
      const checked = row.assets_checked_at ? Date.parse(row.assets_checked_at) : 0
      if (!admin && Date.now() - checked < SINGLE_COOLDOWN_MS) {
        return json({ skipped: 'checked recently', id: row.id })
      }
      const result = await complete(row)
      console.log('[complete-listing]', JSON.stringify(result))
      return json(result)
    }

    const requested = Number.parseInt(String(body.batch ?? '3'), 10) || 3
    const batch = Math.max(1, Math.min(requested, admin ? 10 : 3))

    if (!admin) {
      const { data: last } = await supabase
        .from('software_submissions')
        .select('assets_checked_at')
        .not('assets_checked_at', 'is', null)
        .order('assets_checked_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const lastRun = last?.assets_checked_at ? Date.parse(last.assets_checked_at) : 0
      if (Date.now() - lastRun < BATCH_THROTTLE_MS) return json({ skipped: 'throttled', processed: 0 })
    }

    const { data: rows, error } = await supabase.rpc('listings_needing_assets', { max_rows: batch })
    if (error) return json({ error: error.message }, 500)

    const started = Date.now()
    const results: CompletionResult[] = []
    for (const row of rows ?? []) {
      if (Date.now() - started > BATCH_BUDGET_MS) break
      try {
        results.push(await complete(row))
      } catch (err) {
        console.error('[complete-listing] failed', row.id, err)
        results.push({
          id: row.id,
          title: row.title,
          logo: 'none',
          image: 'none',
          screenshots: 0,
          provider: null,
          notes: [`failed: ${err instanceof Error ? err.message : String(err)}`],
        })
      }
    }
    console.log('[complete-listing] batch', JSON.stringify(results))
    return json({ processed: results.length, remaining_candidates: (rows?.length ?? 0) - results.length, results })
  } catch (error) {
    console.error('[complete-listing] error', error)
    return json({ error: 'Internal server error' }, 500)
  }
})
