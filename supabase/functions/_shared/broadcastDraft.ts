/**
 * AI drafting for the admin email broadcast page: the admin describes the email in a
 * sentence or two and the model returns a subject line plus a markdown body, which
 * the page drops into its Subject and Body fields for editing before sending.
 *
 * Pure prompt + parsing helpers live here so they can be tested without a network;
 * the model call itself is in app/api/admin/broadcast-draft/route.ts.
 */

export type BroadcastAudience = 'newsletter' | 'users' | 'all'

export interface BroadcastDraft {
  subject: string
  content: string
}

export const MAX_DESCRIPTION_LENGTH = 4000

const AUDIENCE_NOTES: Record<BroadcastAudience, string> = {
  newsletter: 'newsletter subscribers who opted in to hear about new SaaS tools',
  users: 'registered SaaSRow users, mostly founders and makers who listed their software',
  all: 'everyone: newsletter subscribers plus founders and makers who listed their software',
}

export const DRAFT_SYSTEM_PROMPT = `You write one-off emails for SaaSRow (saasrow.com), a directory where founders list SaaS and software products and readers discover them. You write like a real person on the team: direct, warm, specific, no hype.

Respond with a JSON object only: {"subject": string, "content": string}.

subject: 35-70 characters, plain text, no emojis, no clickbait, no trailing period.

content: the email body in Markdown. Allowed syntax: ## headings, **bold**, *italic*, [links](https://...), - bullets, 1. numbered lists, > quotes, --- rules. No HTML, no images, no tables, no code fences.
- Open with the point, not a greeting paragraph. A short "Hi there," line is fine.
- Keep it to what the description asks for; never invent numbers, dates, prices, features or quotes. If a detail is needed but missing, leave a clear [placeholder] in square brackets.
- One clear call to action, linked, when the description implies one. Use https://saasrow.com links unless the description gives others.
- 80-250 words unless the description asks for more.
- Sign off as "The SaaSRow team".
- Never use em dashes or en dashes; use commas or hyphens. No emojis.
- Do not add an unsubscribe line or legal footer; one is appended automatically.`

export function buildDraftUserPrompt(description: string, audience: BroadcastAudience, current?: Partial<BroadcastDraft>): string {
  const parts = [`Audience: ${AUDIENCE_NOTES[audience] ?? AUDIENCE_NOTES.all}.`, '', 'What the email should say:', description.trim()]
  const subject = current?.subject?.trim()
  const content = current?.content?.trim()
  if (subject || content) {
    parts.push('', 'There is an existing draft. Rewrite it to follow the description above, keeping anything from it that still fits.')
    if (subject) parts.push(`Existing subject: ${subject}`)
    if (content) parts.push('Existing body:', content)
  }
  return parts.join('\n')
}

/** Em/en dashes are banned by the prompt, but models slip; normalise rather than reject. */
function stripDashes(text: string): string {
  return text.replace(/\s*[–—]\s*/g, ', ').replace(/, ,/g, ',')
}

/** Parses the model's JSON reply; throws when the reply is not a usable draft. */
export function parseDraft(raw: string): BroadcastDraft {
  let json: unknown
  try {
    json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
  } catch {
    throw new Error('The AI reply was not valid JSON')
  }
  const obj = json as Record<string, unknown>
  const subject = typeof obj?.subject === 'string' ? obj.subject.trim() : ''
  const content = typeof obj?.content === 'string' ? obj.content.trim() : ''
  if (!subject || !content) throw new Error('The AI reply was missing a subject or body')
  return {
    subject: stripDashes(subject).replace(/\s+/g, ' ').replace(/\s*\.$/, '').trim(),
    content: stripDashes(content),
  }
}
