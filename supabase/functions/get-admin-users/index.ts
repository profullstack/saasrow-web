import { createClient } from 'npm:@supabase/supabase-js@2.76.1'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { fetchAll } from '../_shared/fetchAll.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Token',
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

    // The response holds every submitter's email, so it is admin-only.
    const admin = await requireAdmin(req, supabase, corsHeaders)
    if (admin instanceof Response) return admin

    const submissions = await fetchAll((from, to) => supabase
      .from('software_submissions')
      .select(`
        id,
        tier,
        created_at,
        submitted_at,
        submission_contacts(email)
      `)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to))

    const tokens = await fetchAll((from, to) => supabase
      .from('user_tokens')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to))

    const subscriptions = await fetchAll((from, to) => supabase
      .from('stripe_subscriptions')
      .select('customer_id, status, current_period_end, cancel_at_period_end, email')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, to))

    return new Response(
      JSON.stringify({
        submissions,
        tokens,
        subscriptions
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
