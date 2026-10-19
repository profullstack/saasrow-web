import { createClient } from 'npm:@supabase/supabase-js@2.76.1'
import { fetchAll } from '../_shared/fetchAll.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const submissions = await fetchAll((from, to) => supabase
      .from('software_submissions')
      .select('id, title, url, view_count, tier, status, submitted_at')
      .order('id', { ascending: true })
      .range(from, to))

    const clicks = await fetchAll((from, to) => supabase
      .from('submission_clicks')
      .select('submission_id')
      .order('id', { ascending: true })
      .range(from, to))

    const clicksBySubmission = clicks.reduce((acc, click) => {
      acc[click.submission_id] = (acc[click.submission_id] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const approved = submissions?.filter(s => s.status === 'approved') || []
    const pending = submissions?.filter(s => s.status === 'pending') || []
    const rejected = submissions?.filter(s => s.status === 'rejected') || []

    const totalViews = submissions?.reduce((sum, s) => sum + (s.view_count || 0), 0) || 0
    const totalClicks = Object.values(clicksBySubmission).reduce((sum, count) => sum + count, 0)

    const topPerformers = approved
      .map(s => ({
        ...s,
        total_clicks: clicksBySubmission[s.id] || 0
      }))
      .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
      .slice(0, 10)

    const tierBreakdown = {
      free: approved.filter(s => s.tier === 'free').length,
      featured: approved.filter(s => s.tier === 'featured').length,
      premium: approved.filter(s => s.tier === 'premium').length,
    }

    return new Response(
      JSON.stringify({
        totalSubmissions: submissions?.length || 0,
        approvedSubmissions: approved.length,
        pendingSubmissions: pending.length,
        rejectedSubmissions: rejected.length,
        totalViews,
        totalClicks,
        topPerformers,
        tierBreakdown,
        recentActivity: []
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})