import { createClient } from 'npm:@supabase/supabase-js@2.76.1'
import { buildEmailParts } from '../_shared/emailMarkdown.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Token',
}

interface NewsletterRequest {
  subject: string
  content: string
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const admin = await requireAdmin(req, supabase, corsHeaders)
    if (admin instanceof Response) return admin
    const adminEmail = admin.email

    const { subject, content }: NewsletterRequest = await req.json()

    if (!subject || !content) {
      return new Response(
        JSON.stringify({ error: 'Subject and content are required' }),
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

    // Markdown body -> multipart/alternative (HTML + text/plain), each carrying the
    // recipient's own unsubscribe link. Pasted markup is escaped, never injected.
    const buildParts = (email: string) =>
      buildEmailParts({
        markdown: content,
        heading: 'SaaSRow Newsletter',
        footer: [
          { text: "You're receiving this email because you subscribed to the SaaSRow newsletter." },
          { text: 'Unsubscribe', href: `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}` },
          { text: 'Visit SaaSRow', href: siteUrl },
          { text: `© ${new Date().getFullYear()} Profullstack, Inc. All rights reserved.` },
        ],
      })

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
            ...buildParts(email),
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
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
