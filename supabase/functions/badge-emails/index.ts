import { createClient } from 'npm:@supabase/supabase-js@2.76.1'
import { badgeEmail, type BadgeEmailKind, type BadgeEmailListing } from '../_shared/badgeEmail.ts'
import { sendableEmails } from '../_shared/emailRecipients.ts'

/**
 * Sends the badge emails that are due. Called by pg_cron every five minutes
 * (see migration 20261125120000) with `{ "batch": 40 }`.
 *
 * It takes no instructions about who to email: everything is read from the
 * listings themselves, and `badge_email_state` records the last email sent, so
 * calling it twice (or from the open internet) sends nothing twice.
 *
 *   live      approved, and the last email said it was hidden
 *             (or it was on notice and the badge has been found)
 *   required  status 'badge_required' and not told yet
 *   notice    live on a grace period and not told yet
 *
 * In that order, so good news and hidden listings never wait behind the long
 * queue of first notices. A row is claimed (state written) before its email is
 * sent: a crash sends nothing rather than something twice.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

const COLUMNS = 'id, title, url, management_token, badge_grace_until, badge_lost_at, badge_verified_at, badge_email_state'

type Row = BadgeEmailListing & { badge_email_state: string | null }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) return json({ sent: 0, skipped: 'RESEND_API_KEY is not set' })
    if (Deno.env.get('BADGE_EMAILS') === 'off') return json({ sent: 0, skipped: 'BADGE_EMAILS=off' })

    const siteUrl = (Deno.env.get('SITE_URL') || 'https://saasrow.pwa.pit.world').replace(/\/$/, '')
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    const body = await req.json().catch(() => ({}))
    let budget = Math.min(100, Math.max(1, Number(body?.batch) || 40))
    const now = new Date().toISOString()
    // `{ "only": "<listing id>" }` narrows a run to one listing: a way to see
    // an email before the queue is opened. It cannot make an email due.
    const only = typeof body?.only === 'string' && /^[0-9a-f-]{36}$/i.test(body.only) ? body.only : null
    const table = () => {
      const q = supabase.from('software_submissions').select(COLUMNS)
      return only ? q.eq('id', only) : q
    }

    const due: Array<{ kind: BadgeEmailKind; row: Row }> = []
    const take = async (kind: BadgeEmailKind, query: PromiseLike<{ data: Row[] | null; error: { message: string } | null }>) => {
      if (budget <= 0) return
      const { data, error } = await query
      if (error) throw new Error(`${kind} query failed: ${error.message}`)
      for (const row of data ?? []) due.push({ kind, row })
      budget -= (data ?? []).length
    }

    await take(
      'live',
      table()
        .eq('status', 'approved')
        .or('badge_email_state.eq.required,and(badge_email_state.eq.notice,badge_verified_at.not.is.null)')
        .limit(budget),
    )
    await take(
      'required',
      table()
        .eq('status', 'badge_required')
        .or('badge_email_state.is.null,badge_email_state.neq.required')
        .limit(Math.max(budget, 0)),
    )
    await take(
      'notice',
      table()
        .eq('status', 'approved')
        .is('badge_email_state', null)
        .is('badge_verified_at', null)
        .eq('badge_exempt', false)
        .not('tier', 'in', '(featured,premium)')
        .gt('badge_grace_until', now)
        .order('badge_grace_until', { ascending: true })
        .limit(Math.max(budget, 0)),
    )

    if (due.length === 0) return json({ sent: 0, due: 0 })

    const { data: contacts } = await supabase
      .from('submission_contacts')
      .select('submission_id, email')
      .in('submission_id', due.map((d) => d.row.id))
    const emailsFor = (id: string) =>
      sendableEmails(
        ((contacts ?? []) as Array<{ submission_id: string; email: string | null }>)
          .filter((c) => c.submission_id === id)
          .map((c) => c.email),
      )

    const messages: Array<Record<string, unknown>> = []
    const counts: Record<string, number> = { live: 0, required: 0, notice: 0 }

    for (const { kind, row } of due) {
      // Claim it: only the caller that moves the state sends the email.
      let claim = supabase
        .from('software_submissions')
        .update({ badge_email_state: kind, badge_email_at: now })
        .eq('id', row.id)
      claim = row.badge_email_state === null ? claim.is('badge_email_state', null) : claim.eq('badge_email_state', row.badge_email_state)
      const { data: claimed, error } = await claim.select('id')
      if (error) {
        console.error(`[badge-emails] claim ${row.id}: ${error.message}`)
        continue
      }
      if (!claimed || claimed.length === 0) continue

      const wasLive = kind === 'required' && row.badge_email_state === 'notice'
      for (const to of emailsFor(row.id)) {
        messages.push({ ...(await badgeEmail(kind, row, siteUrl, { wasLive, seed: to })), to })
      }
      counts[kind]++
    }

    let sent = 0
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100)
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      })
      if (res.ok) sent += chunk.length
      else console.error(`[badge-emails] Resend ${res.status} ${await res.text()}`)
    }

    console.log(`[badge-emails] sent ${sent} (${JSON.stringify(counts)})`)
    return json({ sent, due: due.length, ...counts })
  } catch (error) {
    console.error('[badge-emails] failed:', (error as Error).message)
    return json({ error: 'Internal server error' }, 500)
  }
})
