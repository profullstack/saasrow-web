import { createClient } from 'npm:@supabase/supabase-js@2.76.1'
import { buildEmailParts } from '../_shared/emailMarkdown.ts'
import { sendableEmails } from '../_shared/emailRecipients.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { fetchAll } from '../_shared/fetchAll.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Token',
}

interface BroadcastRequest {
  subject: string
  content: string
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const admin = await requireAdmin(req, supabase, corsHeaders)
    if (admin instanceof Response) return admin
    const adminEmail = admin.email

    const { subject, content, audience = 'all' }: BroadcastRequest = await req.json()

    if (!subject || !content) {
      return new Response(
        JSON.stringify({ error: 'subject and content are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromDomain = Deno.env.get('RESEND_DOMAIN') || 'saasrow.com'
    const siteUrl = Deno.env.get('SITE_URL') || 'https://saasrow.com'

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Resend is not configured. Please set RESEND_API_KEY.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const emailSet = new Set<string>()

    // Paged: an unpaged read stops at 1000 rows and silently skips the rest
    // (the 2026-10-14 broadcast reached 842 people this way).
    if (audience === 'newsletter' || audience === 'all') {
      const subscribers = await fetchAll((from, to) => supabase
        .from('newsletter_subscriptions')
        .select('email')
        .eq('is_active', true)
        .order('id', { ascending: true })
        .range(from, to))
        .catch((error) => { throw new Error(`Newsletter subscribers fetch error: ${error.message}`) })
      for (const row of subscribers) emailSet.add(row.email.toLowerCase())
    }

    if (audience === 'users' || audience === 'all') {
      const contacts = await fetchAll((from, to) => supabase
        .from('submission_contacts')
        .select('email')
        .order('id', { ascending: true })
        .range(from, to))
        .catch((error) => { throw new Error(`Submission contacts fetch error: ${error.message}`) })
      for (const row of contacts) if (row.email) emailSet.add(row.email.toLowerCase())

      const tokens = await fetchAll((from, to) => supabase
        .from('user_tokens')
        .select('email')
        .order('id', { ascending: true })
        .range(from, to))
        .catch((error) => { throw new Error(`User tokens fetch error: ${error.message}`) })
      for (const row of tokens) if (row.email) emailSet.add(row.email.toLowerCase())
    }

    // Resend 422s an entire batch of 100 if a single address sits on a reserved domain
    // (example.com and friends), so seed/test rows are dropped before we send.
    const emailList = sendableEmails(emailSet)
    const skippedCount = emailSet.size - emailList.length

    if (emailList.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            skippedCount > 0
              ? `No sendable recipients: all ${skippedCount} address(es) are invalid or on a reserved domain such as example.com`
              : 'No recipients found for the selected audience',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // The body is authored as markdown (plain text renders fine too) and goes out as
    // multipart/alternative: escaped, inline-styled HTML plus a text/plain part with the
    // same footer. Pasted markup is never injected into the email.
    const { html: htmlContent, text: textContent } = buildEmailParts({
      markdown: content,
      heading: 'SaaSRow',
      footer: [
        { text: "You're receiving this email because you have an account on SaaSRow." },
        { text: 'Visit SaaSRow', href: siteUrl },
        { text: `© ${new Date().getFullYear()} Profullstack, Inc. All rights reserved.` },
      ],
    })

    // Resend's batch endpoint sends individual emails (one per recipient, max 100 per call)
    const BATCH_SIZE = 100
    let totalSent = 0
    let totalFailed = 0
    let firstError = ''
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
            from: `SaaSRow <noreply@${fromDomain}>`,
            to: email,
            subject,
            html: htmlContent,
            text: textContent,
          }))
        ),
      })

      const resendResult = await resendResponse.json()

      // A rejected batch must not lose the batches that follow it.
      if (!resendResponse.ok) {
        totalFailed += batch.length
        const message = resendResult?.message ?? JSON.stringify(resendResult)
        if (!firstError) firstError = message
        console.error(`Resend batch ${i / BATCH_SIZE + 1} failed: ${message}`)
        continue
      }

      totalSent += batch.length
      const ids = resendResult.data
      if (Array.isArray(ids) && ids.length > 0) lastResendId = ids[ids.length - 1].id
    }

    if (totalSent === 0) {
      return new Response(
        JSON.stringify({ error: `Resend error: ${firstError || 'no emails were accepted'}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { error: historyError } = await supabase
      .from('newsletter_history')
      .insert({
        subject,
        content,
        recipient_count: totalSent,
        sent_by: adminEmail,
        resend_id: lastResendId,
      })

    if (historyError) console.error('Failed to save broadcast history:', historyError)

    return new Response(
      JSON.stringify({
        success: true,
        recipientCount: totalSent,
        skippedCount,
        failedCount: totalFailed,
        error: firstError || undefined,
        resendId: lastResendId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Broadcast error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
