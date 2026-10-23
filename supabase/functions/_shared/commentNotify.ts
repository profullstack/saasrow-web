import { buildEmailParts } from './emailMarkdown.ts'
import { sendableEmails } from './emailRecipients.ts'

/**
 * Tells a listing's owner, and everyone else who has commented on it, that a
 * comment went up.
 *
 * Called when a comment becomes public: posted by a signed-in user, or
 * approved by an admin. Never on an anonymous comment still awaiting review,
 * or the comment form would be a way to mail anyone's listing owner anything.
 *
 * Failures are logged, never thrown: the comment is already saved, and a
 * failed email must not turn the post or the approval into an error.
 */

/** Either supabase-js build (jsr or npm): only .from() is used. */
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any }

const PLACEHOLDER = 'SAASROWCOMMENTBODY7f3a'

interface CommentRow {
  id: string
  submission_id: string
  author_name: string | null
  author_email: string | null
  content: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Markdown-inert: a name or title can be bold text, never a link. */
const plain = (text: string) => text.replace(/[*_`[\]()<>#\\]/g, '').trim()

/** Recipients for one comment: owner contacts plus other commenters, minus its author. */
export async function commentRecipients(supabase: Db, comment: CommentRow): Promise<string[]> {
  const [{ data: contacts }, { data: others }] = await Promise.all([
    supabase.from('submission_contacts').select('email').eq('submission_id', comment.submission_id),
    supabase
      .from('comments')
      .select('author_email')
      .eq('submission_id', comment.submission_id)
      .eq('is_verified', true)
      .neq('id', comment.id),
  ])
  const author = (comment.author_email ?? '').trim().toLowerCase()
  return sendableEmails([
    ...(contacts ?? []).map((c: { email: string | null }) => c.email),
    ...(others ?? []).map((c: { author_email: string | null }) => c.author_email),
  ]).filter((email) => email !== author)
}

export async function notifyCommentPublished(supabase: Db, commentIds: string[]): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey || commentIds.length === 0) return
  const siteUrl = (Deno.env.get('SITE_URL') || 'https://saasrow.com').replace(/\/$/, '')

  try {
    const { data: comments, error } = await supabase
      .from('comments')
      .select('id, submission_id, author_name, author_email, content, submission:software_submissions(title)')
      .in('id', commentIds)
    if (error) throw error

    for (const row of comments ?? []) {
      const comment = row as CommentRow & { submission: { title: string } | null }
      const recipients = await commentRecipients(supabase, comment)
      if (recipients.length === 0) continue

      const title = plain(comment.submission?.title || '') || 'a listing'
      const who = plain(comment.author_name || '') || 'Someone'
      const listingUrl = `${siteUrl}/software/${comment.submission_id}`
      const { html, text } = buildEmailParts({
        heading: 'SaaSRow',
        markdown: `**${who}** commented on **${title}**:\n\n${PLACEHOLDER}\n\n[Read and reply on SaaSRow](${listingUrl})`,
        footer: [
          { text: "You're receiving this because you own this listing or commented on it." },
          { text: 'Visit SaaSRow', href: siteUrl },
          { text: `© ${new Date().getFullYear()} Profullstack, Inc. All rights reserved.` },
        ],
      })
      // The comment is user input: escaped and dropped in after rendering, so
      // nothing in it can become a link or markup.
      const quoted = `<span style="display:block;border-left:3px solid #4FFFE3;padding-left:12px;white-space:pre-wrap;">${escapeHtml(comment.content)}</span>`
      const email = {
        from: 'SaaSRow <noreply@saasrow.com>',
        subject: `New comment on ${title}`,
        html: html.replace(PLACEHOLDER, quoted),
        text: text.replace(PLACEHOLDER, comment.content),
      }

      // One email per recipient, so nobody sees anyone else's address.
      for (let i = 0; i < recipients.length; i += 100) {
        const batch = recipients.slice(i, i + 100).map((to) => ({ ...email, to }))
        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        })
        if (!res.ok) console.error(`[comment-notify] ${comment.id}: Resend ${res.status} ${await res.text()}`)
        else console.log(`[comment-notify] ${comment.id}: sent to ${batch.length}`)
      }
    }
  } catch (err) {
    console.error('[comment-notify] failed:', (err as Error).message)
  }
}
