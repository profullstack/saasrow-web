import { createClient } from 'npm:@supabase/supabase-js@2.76.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Token',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('autoblog_config')
        .select('webhook_secret, enabled')
        .maybeSingle()

      if (error) {
        console.error('Failed to fetch autoblog config:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to fetch configuration' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ webhook_secret: data?.webhook_secret ?? '', enabled: data?.enabled ?? true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const webhookSecret = typeof body.webhook_secret === 'string' ? body.webhook_secret : ''
      const enabled = typeof body.enabled === 'boolean' ? body.enabled : true

      const { data: existing } = await supabase
        .from('autoblog_config')
        .select('id')
        .maybeSingle()

      const { error } = existing?.id
        ? await supabase
            .from('autoblog_config')
            .update({ webhook_secret: webhookSecret, enabled, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
        : await supabase
            .from('autoblog_config')
            .insert({ webhook_secret: webhookSecret, enabled })

      if (error) {
        console.error('Failed to save autoblog config:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to save configuration' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
