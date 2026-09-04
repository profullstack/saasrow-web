// Re-capture the screenshot gallery for one featured/premium listing, on
// demand from the management page. Throws away the existing gallery and
// rebuilds it (homepage plus top navigation pages) through the shared
// provider chain, then fills any missing logo or image on the way.
//
// Approval-time and periodic capture live in `complete-listing`; this
// function is only the manual "refresh my screenshots" button.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.76.1'
import { captureScreenshot, completeListingAssets } from '../_shared/listingAssets.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const env = {
      SCREENSHOT_API_KEY: Deno.env.get('SCREENSHOT_API_KEY'),
      GETSCREENSHOT_API_KEY: Deno.env.get('GETSCREENSHOT_API_KEY'),
    }

    const { submissionId, tier } = await req.json().catch(() => ({}))
    if (!submissionId) return json({ error: 'Missing required field: submissionId' }, 400)

    const { data: row } = await supabase
      .from('software_submissions')
      .select('id, url, title, tier, logo, image, status')
      .eq('id', submissionId)
      .maybeSingle()
    if (!row) return json({ error: 'No such submission' }, 404)

    const effectiveTier = row.tier ?? tier
    if (effectiveTier !== 'featured' && effectiveTier !== 'premium') {
      return json({ error: 'Screenshot gallery is only available for Featured and Premium tiers' }, 400)
    }

    const { data: existing } = await supabase
      .from('submission_screenshots')
      .select('id, storage_path')
      .eq('submission_id', submissionId)
    const paths = (existing ?? []).map((s: { storage_path: string | null }) => s.storage_path).filter(Boolean) as string[]
    if (paths.length > 0) await supabase.storage.from('submission-screenshots').remove(paths)
    if ((existing ?? []).length > 0) {
      await supabase.from('submission_screenshots').delete().eq('submission_id', submissionId)
    }

    const result = await completeListingAssets(
      supabase,
      { ...row, tier: effectiveTier },
      {
        screenshot: (url) => captureScreenshot(url, env, { log: (m) => console.log('[screenshot]', m) }),
        maxNavPages: 4,
        log: (m) => console.log('[capture-screenshots]', m),
      },
    )

    const { data: screenshots } = await supabase
      .from('submission_screenshots')
      .select('page_title, page_url, screenshot_url')
      .eq('submission_id', submissionId)
      .order('captured_at', { ascending: true })

    return json({
      success: result.screenshots > 0,
      screenshotCount: result.screenshots,
      provider: result.provider,
      screenshots: (screenshots ?? []).map((s: { page_title: string; page_url: string; screenshot_url: string }) => ({
        pageTitle: s.page_title,
        pageUrl: s.page_url,
        screenshotUrl: s.screenshot_url,
      })),
      errors: result.notes.length > 0 ? result.notes : undefined,
    })
  } catch (error) {
    console.error('Error in capture-screenshots function:', error)
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})
