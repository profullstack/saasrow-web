import { buildEmailParts } from './emailMarkdown.ts'
import { networkPromo } from './networkPromo.ts'

/**
 * The emails behind the free tier's badge rule (migration 20261125120000): a
 * free listing is live only while its website links back to its SaaSRow page.
 *
 *   notice    still live, a grace period is running: add the badge by <date>
 *             (`lost`: the badge was there and has gone missing)
 *   required  approved but hidden until the badge is on the site
 *             (`wasLive`: it was live and the grace period ran out)
 *   live      the listing is live (badge found, upgraded or waived)
 *
 * Pure builders; badge-emails/index.ts decides who is due which.
 */

export type BadgeEmailKind = 'notice' | 'required' | 'live'

export interface BadgeEmailListing {
  id: string
  title: string
  url: string
  management_token?: string | null
  badge_grace_until?: string | null
  badge_lost_at?: string | null
  badge_verified_at?: string | null
}

export const BADGE_W = 200
export const BADGE_H = 44

/** Markdown-inert: a title can be bold text, never a link. */
const plain = (text: string) => text.replace(/[*_`[\]()<>#\\]/g, '').trim()

const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The same HTML the manage page hands out (src/lib/badgeShared.ts). */
export function badgeHtml(listing: { id: string; title: string }, siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, '')
  const page = `${base}/software/${listing.id}`
  return `<a href="${page}"><img src="${page}/badge.svg" alt="${attr(`${listing.title} on SaaSRow`)}" width="${BADGE_W}" height="${BADGE_H}" loading="lazy"></a>`
}

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : null

export async function badgeEmail(
  kind: BadgeEmailKind,
  listing: BadgeEmailListing,
  siteUrl: string,
  opts: { wasLive?: boolean; seed?: string } = {},
) {
  const base = siteUrl.replace(/\/+$/, '')
  const name = plain(listing.title) || 'Your listing'
  const page = `${base}/software/${listing.id}`
  const manage = listing.management_token ? `${base}/manage/${encodeURIComponent(listing.management_token)}` : `${base}/submit`
  const featured = `${base}/featured`
  const snippet = ['```', badgeHtml(listing, base), '```'].join('\n')
  const lost = Boolean(listing.badge_lost_at)
  const by = day(listing.badge_grace_until)

  const howTo = [
    `Paste this into the HTML of ${listing.url} (the footer works well):`,
    snippet,
    `Any link to ${page} counts, the badge is just the easy way. It has to be in the page's HTML, not added later by JavaScript.`,
    `Then [check it from your listing page](${manage}). We also look on our own twice a day.`,
    `Would rather not? [Featured is $2 lifetime](${featured}): one payment, no badge to keep.`,
  ]

  let subject: string
  let lines: string[]

  if (kind === 'live') {
    subject = `${name} is live on SaaSRow`
    lines = [
      `🎉 **${name}** is live on SaaSRow.`,
      `[View your listing](${page})`,
      listing.badge_verified_at
        ? 'We found the badge on your site. Keep it there: we re-check every day, and a free listing whose badge is gone is hidden after 3 days.'
        : 'Share the link so people can find it, upvote it and comment on it.',
    ]
  } else if (kind === 'required') {
    if (opts.wasLive) {
      subject = `${name} is hidden on SaaSRow until the badge is on your site`
      lines = [
        `**${name}** is no longer showing on SaaSRow: free listings now need the SaaSRow badge on their site, and we could not find it on yours.`,
        'Nothing is lost. The listing, its upvotes and its comments come back the moment the badge is there.',
        ...howTo,
      ]
    } else {
      subject = `${name} is approved: add the badge to go live`
      lines = [
        `✅ **${name}** is approved. One step left: free listings go live once their site carries the SaaSRow badge.`,
        ...howTo,
      ]
    }
  } else if (lost) {
    subject = `The SaaSRow badge is missing from ${name}`
    lines = [
      `We could no longer find the SaaSRow badge on ${listing.url}. **${name}** stays listed${by ? ` until ${by}` : ' for 3 more days'}; after that it is hidden until the badge is back.`,
      ...howTo,
    ]
  } else {
    subject = `Add the SaaSRow badge to keep ${name} listed`
    lines = [
      `Free listings on SaaSRow now need the SaaSRow badge on their site. **${name}** stays listed${by ? ` until ${by}` : ''}; after that it is hidden until the badge is there.`,
      'It is one line of HTML, and it shows your live upvote count.',
      ...howTo,
    ]
  }

  const promo = await networkPromo(opts.seed)
  const { html, text } = buildEmailParts({
    heading: 'SaaSRow',
    markdown: [...lines, '---', promo.markdown].join('\n\n'),
    footer: [
      { text: "You're receiving this because you submitted this software to SaaSRow." },
      { text: 'Manage your listing', href: manage },
      { text: `© ${new Date().getFullYear()} Profullstack, Inc. All rights reserved.` },
    ],
  })

  return {
    from: 'SaaSRow <noreply@saasrow.com>',
    reply_to: 'support@saasrow.com',
    subject,
    html,
    // The markdown text part would show promo links as [name](url); the
    // hand-written one reads better in a plain-text client.
    text: text.split('\n---')[0].trimEnd() + (promo.text ? '\n\n' + promo.text : ''),
  }
}
