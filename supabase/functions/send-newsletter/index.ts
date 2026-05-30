import { createClient } from 'npm:@supabase/supabase-js@2.76.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface NewsletterRequest {
  subject: string
  content: string
  adminEmail: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { subject, content, adminEmail }: NewsletterRequest = await req.json()

    if (!subject || !content || !adminEmail) {
      return new Response(
        JSON.stringify({ error: 'Subject, content, and adminEmail are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromDomain = Deno.env.get('RESEND_DOMAIN') || 'saasrow.com'
    const siteUrl = Deno.env.get('SITE_URL') || 'https://saasrow.com'

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({
          error: 'Resend is not configured. Please set RESEND_API_KEY environment variable.'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: subscribers, error: dbError } = await supabase
      .from('newsletter_subscriptions')
      .select('email')
      .eq('is_active', true)

    if (dbError) {
      return new Response(
        JSON.stringify({ error: `Database error: ${dbError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!subscribers || subscribers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No active subscribers found' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const emailList = subscribers.map(s => s.email)

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Ubuntu', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(to bottom, #E0FF04, #4FFFE3);
      padding: 30px;
      text-align: center;
      border-radius: 10px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      color: #000;
      font-size: 28px;
    }
    .content {
      background: #f9f9f9;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 20px;
    }
    .content p {
      margin-bottom: 15px;
      white-space: pre-wrap;
    }
    .footer {
      text-align: center;
      color: #666;
      font-size: 12px;
      padding: 20px;
      border-top: 1px solid #ddd;
    }
    .footer a {
      color: #4FFFE3;
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>SaaSRow Newsletter</h1>
  </div>
  <div class="content">
    ${content.split('\n').map(para => para.trim() ? `<p>${para}</p>` : '').join('')}
  </div>
  <div class="footer">
    <p>You're receiving this email because you subscribed to the SaaSRow newsletter.</p>
    <p>
      <a href="${siteUrl}/unsubscribe?email=%recipient.email%">Unsubscribe</a> |
      <a href="${siteUrl}">Visit SaaSRow</a>
    </p>
    <p>© ${new Date().getFullYear()} Profullstack, Inc. All rights reserved.</p>
  </div>
</body>
</html>
    `.trim()

    // Resend's batch endpoint sends individual emails (one per recipient, max 100 per call)
    const BATCH_SIZE = 100
    let lastResendId = ''

    for (let i = 0; i < emailList.length; i += BATCH_SIZE) {
      const batch = emailList.slice(i, i + BATCH_SIZE)

      const resendResponse = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          batch.map(email => ({
            from: `SaaSRow <newsletter@${fromDomain}>`,
            to: email,
            subject,
            // Per-recipient unsubscribe link (replaces Mailgun's %recipient.email% template var)
            html: htmlContent.replace('%recipient.email%', encodeURIComponent(email)),
            text: content,
          }))
        ),
      })

      const resendResult = await resendResponse.json()

      if (!resendResponse.ok) {
        console.error('Resend error:', resendResult)
        return new Response(
          JSON.stringify({
            error: 'Failed to send newsletter via Resend',
            details: resendResult
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const ids = resendResult.data
      if (Array.isArray(ids) && ids.length > 0) lastResendId = ids[ids.length - 1].id
    }

    const { error: historyError } = await supabase
      .from('newsletter_history')
      .insert({
        subject,
        content,
        recipient_count: emailList.length,
        sent_by: adminEmail,
        resend_id: lastResendId
      })

    if (historyError) {
      console.error('Failed to save newsletter history:', historyError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Newsletter sent to ${emailList.length} subscribers`,
        resendId: lastResendId,
        recipientCount: emailList.length
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Newsletter error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
