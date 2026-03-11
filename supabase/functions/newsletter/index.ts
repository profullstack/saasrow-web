import { createClient } from 'npm:@supabase/supabase-js@2.76.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const showAll = url.searchParams.get('all') === 'true'

      if (showAll) {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data, error } = await supabaseAdmin
          .from('newsletter_subscriptions')
          .select('*')
          .order('subscribed_at', { ascending: false })

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
          JSON.stringify({ data }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { count, error } = await supabase
        .from('newsletter_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

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
        JSON.stringify({ count }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const { email } = body

      if (!email) {
        return new Response(
          JSON.stringify({ error: 'Email is required' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({ error: 'Invalid email format' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const { data, error } = await supabaseAdmin
        .from('newsletter_subscriptions')
        .insert({ email })
        .select()
        .maybeSingle()

      if (error) {
        if (error.message.includes('duplicate')) {
          return new Response(
            JSON.stringify({ error: 'Email already subscribed' }),
            {
              status: 409,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }

        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      try {
        const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY')
        const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN')

        if (mailgunApiKey && mailgunDomain) {
          const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'

          const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Welcome to SaaSRow Newsletter!</title><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%); color: #ffffff; line-height: 1.6; padding: 40px 20px; } .container { max-width: 600px; margin: 0 auto; background: linear-gradient(180deg, #1a1a1a 0%, #2a2a2a 100%); border-radius: 24px; padding: 48px 40px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid rgba(79, 255, 227, 0.1); } .header { text-align: center; margin-bottom: 40px; padding-bottom: 30px; border-bottom: 2px solid rgba(79, 255, 227, 0.2); } .logo { height: 64px; width: auto; margin: 0 auto 12px; display: block; } .subtitle { color: #4FFFE3; font-size: 24px; font-weight: 600; margin: 0; } .content { color: #e0e0e0; font-size: 16px; line-height: 1.8; margin-bottom: 32px; } .content p { margin-bottom: 16px; } .highlight { color: #4FFFE3; font-weight: 600; } .discount-box { background: linear-gradient(135deg, #E0FF04 0%, #4FFFE3 100%); border-radius: 16px; padding: 32px; margin: 32px 0; text-align: center; } .discount-code { font-size: 36px; font-weight: 800; color: #0a0a0a; letter-spacing: 4px; margin: 16px 0; padding: 16px 24px; background: rgba(255, 255, 255, 0.9); border-radius: 12px; display: inline-block; } .discount-text { color: #0a0a0a; font-size: 18px; font-weight: 600; margin-bottom: 8px; } .discount-subtext { color: #1a1a1a; font-size: 14px; } .button { display: inline-block; background: linear-gradient(135deg, #E0FF04 0%, #4FFFE3 100%); color: #0a0a0a; padding: 18px 48px; border-radius: 30px; text-decoration: none; font-weight: 700; font-size: 16px; box-shadow: 0 10px 30px rgba(79, 255, 227, 0.3); margin-top: 24px; } .footer { text-align: center; color: #888; font-size: 13px; margin-top: 40px; padding-top: 30px; border-top: 1px solid rgba(255, 255, 255, 0.1); line-height: 1.6; } @media only screen and (max-width: 600px) { .container { padding: 32px 24px; } .logo { height: 48px; } .subtitle { font-size: 20px; } .discount-code { font-size: 28px; letter-spacing: 3px; } }</style></head><body><div class="container"><div class="header"><img src="https://saasrow.com/wiresniff-logo-1-1.png" alt="SaaSRow" class="logo" /><h2 class="subtitle">Welcome to Our Newsletter! 🎉</h2></div><div class="content"><p>👋 <strong>Thanks for subscribing!</strong></p><p>You're now part of our community and will receive <span class="highlight">weekly updates</span> about the latest self-hosted software, news, and exclusive content every Friday.</p></div><div class="discount-box"><p class="discount-text">🎁 Here's Your Exclusive Discount Code</p><div class="discount-code">50OFF</div><p class="discount-subtext">Get 50% off Featured or Premium listings!</p></div><div class="content"><p>Use this code when submitting your software to SaaSRow to get <strong>50% off</strong> any Featured or Premium tier.</p><div style="text-align: center;"><a href="${siteUrl}/submit" class="button">Submit Your Software</a></div></div><div class="footer"><p><strong>SaaSRow</strong> - The World's Best Place to Find Software</p><p style="margin-top: 8px;">Don't want to receive these emails? <a href="${siteUrl}/unsubscribe" style="color: #4FFFE3;">Unsubscribe here</a></p></div></div></body></html>`

          const emailText = `Welcome to SaaSRow Newsletter! 🎉\n\nThanks for subscribing!\n\nYou're now part of our community and will receive weekly updates about the latest self-hosted software, news, and exclusive content every Friday.\n\n🎁 Here's Your Exclusive Discount Code: 50OFF\n\nGet 50% off Featured or Premium listings!\n\nUse this code when submitting your software to SaaSRow to get 50% off any Featured or Premium tier.\n\nSubmit your software: ${siteUrl}/submit\n\n---\nSaaSRow - The World's Best Place to Find Software\nDon't want to receive these emails? Unsubscribe here: ${siteUrl}/unsubscribe`

          const formData = new FormData()
          formData.append('from', 'SaaSRow <noreply@saasrow.com>')
          formData.append('to', email)
          formData.append('subject', 'Welcome to SaaSRow Newsletter + Your 50% Discount Code! 🎁')
          formData.append('html', emailHtml)
          formData.append('text', emailText)

          const mailgunResponse = await fetch(
            `https://api.mailgun.net/v3/${mailgunDomain}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${btoa(`api:${mailgunApiKey}`)}`,
              },
              body: formData,
            }
          )

          if (!mailgunResponse.ok) {
            console.error('Mailgun API error:', await mailgunResponse.text())
          } else {
            console.log('Welcome email sent successfully to:', email)
          }
        } else {
          console.log('MAILGUN_API_KEY or MAILGUN_DOMAIN not configured')
          console.log('Would send welcome email to:', email)
        }
      } catch (emailErr) {
        console.error('Error sending welcome email:', emailErr)
      }

      return new Response(
        JSON.stringify({ data, message: 'Successfully subscribed! Check your email for your discount code.' }),
        {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (req.method === 'DELETE') {
      const body = await req.json()
      const { email } = body

      if (!email) {
        return new Response(
          JSON.stringify({ error: 'Email is required' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { error } = await supabase
        .from('newsletter_subscriptions')
        .update({ is_active: false })
        .eq('email', email)

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
        JSON.stringify({ message: 'Successfully unsubscribed' }),
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
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})