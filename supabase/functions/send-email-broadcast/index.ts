import { createClient } from 'npm:@supabase/supabase-js@2.76.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface BroadcastRequest {
  subject: string
  content: string
  adminEmail: string
  audience: 'newsletter' | 'users' | 'all'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { subject, content, adminEmail, audience = 'all' }: BroadcastRequest = await req.json()

    if (!subject || !content || !adminEmail) {
      return new Response(
        JSON.stringify({ error: 'subject, content, and adminEmail are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY')
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN')
    const siteUrl = Deno.env.get('SITE_URL') || 'https://saasrow.com'

    if (!mailgunApiKey || !mailgunDomain) {
      return new Response(
        JSON.stringify({ error: 'Mailgun is not configured. Please set MAILGUN_API_KEY and MAILGUN_DOMAIN.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const emailSet = new Set<string>()

    if (audience === 'newsletter' || audience === 'all') {
      const { data: subscribers, error } = await supabase
        .from('newsletter_subscriptions')
        .select('email')
        .eq('is_active', true)
      if (error) throw new Error(`Newsletter subscribers fetch error: ${error.message}`)
      for (const row of subscribers ?? []) emailSet.add(row.email.toLowerCase())
    }

    if (audience === 'users' || audience === 'all') {
      const { data: contacts, error } = await supabase
        .from('submission_contacts')
        .select('email')
      if (error) throw new Error(`Submission contacts fetch error: ${error.message}`)
      for (const row of contacts ?? []) if (row.email) emailSet.add(row.email.toLowerCase())

      const { data: tokens, error: tokensError } = await supabase
        .from('user_tokens')
        .select('email')
      if (tokensError) throw new Error(`User tokens fetch error: ${tokensError.message}`)
      for (const row of tokens ?? []) if (row.email) emailSet.add(row.email.toLowerCase())
    }

    const emailList = Array.from(emailSet)

    if (emailList.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No recipients found for the selected audience' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Ubuntu', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(to bottom, #E0FF04, #4FFFE3); padding: 30px; text-align: center; border-radius: 10px; margin-bottom: 30px; }
    .header h1 { margin: 0; color: #000; font-size: 28px; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 10px; margin-bottom: 20px; }
    .content p { margin-bottom: 15px; white-space: pre-wrap; }
    .footer { text-align: center; color: #666; font-size: 12px; padding: 20px; border-top: 1px solid #ddd; }
    .footer a { color: #4FFFE3; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header"><h1>SaaSRow</h1></div>
  <div class="content">
    ${content.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}
  </div>
  <div class="footer">
    <p>You're receiving this email because you have an account on SaaSRow.</p>
    <p><a href="${siteUrl}">Visit SaaSRow</a></p>
    <p>© ${new Date().getFullYear()} Profullstack, Inc. All rights reserved.</p>
  </div>
</body>
</html>`

    // Mailgun supports up to 1000 recipients per message; batch if needed
    const BATCH_SIZE = 1000
    let totalSent = 0
    let lastMailgunId = ''

    for (let i = 0; i < emailList.length; i += BATCH_SIZE) {
      const batch = emailList.slice(i, i + BATCH_SIZE)
      const formData = new FormData()
      formData.append('from', `SaaSRow <noreply@${mailgunDomain}>`)
      formData.append('to', batch.join(','))
      formData.append('subject', subject)
      formData.append('html', htmlContent)
      formData.append('text', content)
      formData.append('recipient-variables', JSON.stringify(
        Object.fromEntries(batch.map(e => [e, { email: e }]))
      ))

      const mailgunResponse = await fetch(
        `https://api.mailgun.net/v3/${mailgunDomain}/messages`,
        {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`api:${mailgunApiKey}`)}` },
          body: formData,
        }
      )

      const mailgunResult = await mailgunResponse.json()
      if (!mailgunResponse.ok) {
        throw new Error(`Mailgun error: ${JSON.stringify(mailgunResult)}`)
      }

      totalSent += batch.length
      lastMailgunId = mailgunResult.id
    }

    const { error: historyError } = await supabase
      .from('newsletter_history')
      .insert({
        subject,
        content,
        recipient_count: totalSent,
        sent_by: adminEmail,
        mailgun_id: lastMailgunId,
      })

    if (historyError) console.error('Failed to save broadcast history:', historyError)

    return new Response(
      JSON.stringify({ success: true, recipientCount: totalSent, mailgunId: lastMailgunId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Broadcast error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
