/**
 * "Keep going" block for emails to people who list software on SaaSRow: two
 * more free directories, a free demo video, and a way to post it everywhere.
 *
 * Used by the submission email (send-management-link) and the approval email
 * (approvalNotify). One list, so the two emails never drift apart.
 */

export interface PromoLink {
  name: string
  href: string
  pitch: string
}

export const LIST_FREE: PromoLink[] = [
  {
    name: 'built.indie',
    href: 'https://built.indie.pit.world/submit',
    pitch: 'launch your indie product with one URL. Free.',
  },
  {
    name: 'pwamart',
    href: 'https://pwamart.com/console/submit',
    pitch: 'the app store for web apps. Free to list.',
  },
]

export const DEMO: PromoLink = {
  name: 'demo.movie',
  href: 'https://demo.movie',
  pitch: 'give it your URL and it films, scripts, narrates and cuts a demo video of your product. Free.',
}

export const SHARE: PromoLink = {
  name: 'myna',
  href: 'https://mynaposter.com',
  pitch: 'post that video to 36 social networks at once.',
}

/** Markdown for emails built with buildEmailParts. */
export function promoMarkdown(): string {
  const item = (l: PromoLink) => `- [${l.name}](${l.href}): ${l.pitch}`
  return [
    '### List it free in two more places',
    LIST_FREE.map(item).join('\n'),
    '### Get a free demo video',
    item(DEMO),
    item(SHARE),
  ].join('\n\n')
}

/** Plain-text part. */
export function promoText(): string {
  const item = (l: PromoLink) => `- ${l.name}: ${l.pitch}\n  ${l.href}`
  return [
    'List it free in two more places:',
    LIST_FREE.map(item).join('\n'),
    '',
    'Get a free demo video:',
    item(DEMO),
    item(SHARE),
  ].join('\n')
}

/** Inline-styled HTML for the dark send-management-link template. */
export function promoHtml(): string {
  const item = (l: PromoLink) =>
    `<li style="margin-bottom: 8px;"><a href="${l.href}" style="color: #4FFFE3; font-weight: 600; text-decoration: none;">${l.name}</a>: ${l.pitch}</li>`
  const heading = (text: string) =>
    `<p style="color: #E0FF04; font-weight: 700; margin: 16px 0 8px;">${text}</p>`
  return `
            <div style="background: rgba(79, 255, 227, 0.06); border: 1px solid rgba(79, 255, 227, 0.2); border-radius: 12px; padding: 20px 24px; margin-top: 24px; color: #ccc; font-size: 15px;">
              ${heading('🌱 List it free in two more places')}
              <ul style="margin: 0; padding-left: 20px;">${LIST_FREE.map(item).join('')}</ul>
              ${heading('🎬 Get a free demo video')}
              <ul style="margin: 0; padding-left: 20px;">${item(DEMO)}${item(SHARE)}</ul>
            </div>`
}
