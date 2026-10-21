import { createClient } from 'npm:@supabase/supabase-js@2.76.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const { token } = await req.json()

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: userToken } = await supabase
      .from('user_tokens')
      .select('email, tier, created_at, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (!userToken) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    let subscriptionInfo = null
    let billingHistory = []

    // Premium months and years are fixed terms paid through CoinPay: the live
    // one (latest period_end in the future) is the "subscription".
    const now = Date.now()
    const { data: orders } = await supabase
      .from('coinpay_orders')
      .select('id, tier, term, amount_cents, currency, status, method, period_start, period_end, created_at')
      .ilike('email', userToken.email.replace(/[\\%_]/g, (c: string) => `\\${c}`))
      .order('created_at', { ascending: false })
      .limit(20)

    const live = (orders ?? [])
      .filter((o) => o.term !== 'once' && o.period_end && new Date(o.period_end).getTime() > now)
      .sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime())[0]

    if (live) {
      subscriptionInfo = {
        tier: userToken.tier,
        status: 'active',
        term: live.term,
        currentPeriodStart: Math.floor(new Date(live.period_start ?? live.created_at).getTime() / 1000),
        currentPeriodEnd: Math.floor(new Date(live.period_end).getTime() / 1000),
        renews: false,
      }
    }

    billingHistory = (orders ?? []).slice(0, 10).map((order) => ({
      id: order.id,
      amount: order.amount_cents,
      currency: order.currency,
      status: order.status,
      method: order.method,
      createdAt: order.created_at,
    }))

    return new Response(
      JSON.stringify({
        tier: userToken.tier,
        subscription: subscriptionInfo,
        billingHistory,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})