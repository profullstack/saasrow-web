import { createClient } from 'npm:@supabase/supabase-js@2.76.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

    const adminToken = req.headers.get('X-Admin-Token')
    if (!adminToken) {
      return new Response(
        JSON.stringify({ error: 'Admin token required' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: validToken } = await supabase
      .from('admin_tokens')
      .select('email')
      .eq('token', adminToken)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (!validToken) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired admin token' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (req.method === 'PATCH') {
      const body = await req.json()
      const { id, status, tier } = body

      if (!id) {
        return new Response(
          JSON.stringify({ error: 'Missing submission id' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const updates: any = {}
      if (status) updates.status = status
      if (tier) updates.tier = tier

      const { data, error } = await supabase
        .from('software_submissions')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Every approved listing, whatever its tier, gets its logo, image and
      // screenshots filled in. This runs after the response is sent so a
      // slow screenshot provider never slows down (or fails) the approval;
      // the pg_cron sweep retries anything that does not complete.
      if (status === 'approved' && data) {
        const run = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/complete-listing`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ submissionId: data.id }),
        })
          .then((res) => console.log(`complete-listing for ${data.id}: ${res.status}`))
          .catch((err) => console.error('Error triggering complete-listing:', err))
        // deno-lint-ignore no-explicit-any
        const runtime = (globalThis as any).EdgeRuntime
        if (runtime?.waitUntil) runtime.waitUntil(run)
        else await run
      }

      return new Response(
        JSON.stringify({ data }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (req.method === 'DELETE') {
      const body = await req.json()
      const { id } = body

      if (!id) {
        return new Response(
          JSON.stringify({ error: 'Missing submission id' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { error } = await supabase
        .from('software_submissions')
        .delete()
        .eq('id', id)

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      return new Response(
        JSON.stringify({ message: 'Submission deleted successfully' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
