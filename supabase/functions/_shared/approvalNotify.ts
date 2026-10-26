import { buildEmailParts } from './emailMarkdown.ts'
import { sendableEmails } from './emailRecipients.ts'
import { promoMarkdown, promoText } from './networkPromo.ts'

/**
 * Tells a listing's contacts that an admin approved it and it is live.
 *
 * Called once, on the transition into 'approved'. Failures are logged, never
 * thrown: the approval is already saved and must not turn into an error.
 */

/** Either supabase-js build (jsr or npm): only .from() is used. */
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any }

/** Markdown-inert: a title can be bold text, never a link. */
const plain = (text: string) => text.replace(/[*_`[\]()<>#\\]/g, '').trim()

export function approvalEmail(title: string, listingUrl: string, siteUrl: string) {
  const name = plain(title) || 'Your listing'
  const { html, text } = buildEmailParts({
    heading: 'SaaSRow',
    markdown: [
      `🎉 **${name}** is approved and live on SaaSRow.`,
      `[View your listing](${listingUrl})`,
      'Share the link so people can find it, upvote it and comment on it.',
      '---',
      promoMarkdown(),
    ].join('\n\n'),
    footer: [
      { text: "You're receiving this because you submitted this software to SaaSRow." },
      { text: 'Visit SaaSRow', href: siteUrl },
      { text: `© ${new Date().getFullYear()} Profullstack, Inc. All rights reserved.` },
    ],
  })
  return {
    from: 'SaaSRow <noreply@saasrow.com>',
    subject: `${name} is live on SaaSRow`,
    html,
    // The markdown text part would show promo links as [name](url); the
    // hand-written one reads better in a plain-text client.
    text: text.split('\n---')[0].trimEnd() + '\n\n' + promoText(),
  }
}

export async function notifyListingApproved(supabase: Db, submissionId: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return
  const siteUrl = (Deno.env.get('SITE_URL') || 'https://saasrow.com').replace(/\/$/, '')

  try {
    const [{ data: submission }, { data: contacts }] = await Promise.all([
      supabase.from('software_submissions').select('title').eq('id', submissionId).maybeSingle(),
      supabase.from('submission_contacts').select('email').eq('submission_id', submissionId),
    ])
    const recipients = sendableEmails((contacts ?? []).map((c: { email: string | null }) => c.email))
    if (recipients.length === 0) return

    const email = approvalEmail(submission?.title || '', `${siteUrl}/software/${submissionId}`, siteUrl)
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(recipients.map((to) => ({ ...email, to }))),
    })
    if (!res.ok) console.error(`[approval-notify] ${submissionId}: Resend ${res.status} ${await res.text()}`)
    else console.log(`[approval-notify] ${submissionId}: sent to ${recipients.length}`)
  } catch (err) {
    console.error('[approval-notify] failed:', (err as Error).message)
  }
}
