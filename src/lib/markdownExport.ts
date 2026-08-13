// Markdown renderings of directory data.
//
// Markdown is the cheapest possible format for a language model to consume:
// no HTML chrome, no navigation, no scripts -- just the facts, in the order
// they matter. These functions are pure so they can be tested directly.

import type { Submission } from './submissions'
import { siteUrl } from './structuredData'

function bullet(label: string, value: string | null | undefined): string | null {
  if (!value) return null
  return `- **${label}:** ${value}`
}

function list(label: string, values: string[] | undefined): string | null {
  if (!values || values.length === 0) return null
  return `- **${label}:** ${values.join(', ')}`
}

/** A single product as a self-contained markdown document. */
export function productMarkdown(submission: Submission): string {
  const base = siteUrl()
  const lines: string[] = [`# ${submission.title}`, '']

  if (submission.description) {
    lines.push(submission.description, '')
  }

  const facts = [
    bullet('Website', submission.url),
    bullet('SaaSRow listing', `${base}/software/${submission.id}`),
    bullet('Category', submission.category),
    list('Use cases', submission.use_cases),
    list('Audiences', submission.audiences),
    list('Platforms', submission.platforms),
    bullet('Pricing model', submission.pricing_model),
    list('Alternative to', submission.alternatives),
    list('Tags', submission.tags),
    bullet(
      'Community',
      submission.upvotes ? `${submission.upvotes} upvotes` : null,
    ),
  ].filter((line): line is string => line !== null)

  if (facts.length) {
    lines.push(...facts, '')
  }

  lines.push(
    '---',
    '',
    `Structured data: ${base}/api/v1/products/${submission.id}`,
  )

  return lines.join('\n')
}

/**
 * The llms.txt index: a short orientation plus links to every machine-readable
 * surface. Deliberately compact — this is the file a crawler reads first.
 */
export function llmsTxt(opts: {
  categories: Array<{ name: string; count: number }>
  listingCount: number
}): string {
  const base = siteUrl()
  const lines = [
    '# SaaSRow',
    '',
    '> A directory of software and SaaS products, published as structured data for humans, search engines and AI agents. Every listing is available as JSON, as markdown, and as schema.org JSON-LD. No API key is required for any of it.',
    '',
    `The directory currently holds ${opts.listingCount} approved listings across ${opts.categories.length} categories.`,
    '',
    '## Machine-readable access',
    '',
    `- [Public API index](${base}/api/v1): self-describing index of every endpoint.`,
    `- [Products](${base}/api/v1/products): filter by category, use case, audience, platform, pricing model, or "alternative to" a named competitor.`,
    `- [Controlled vocabulary](${base}/api/v1/vocabulary): the exact terms those filters accept.`,
    `- [Categories](${base}/api/v1/categories): every category with product counts.`,
    `- [MCP server](${base}/api/mcp): the same directory as callable Model Context Protocol tools.`,
    `- [Full directory as markdown](${base}/llms-full.txt): every listing in one file.`,
    `- [Directory stats](${base}/api/v1/stats): usage numbers, with the counting method stated.`,
    '',
    '## Browse',
    '',
    `- [All products](${base}/explore)`,
    `- [Categories](${base}/categories)`,
    `- [Featured](${base}/featured)`,
    `- [Submit a product](${base}/submit)`,
    '',
    '## Categories',
    '',
    ...opts.categories
      .slice(0, 60)
      .map(
        (c) =>
          `- [${c.name}](${base}/category/${encodeURIComponent(c.name.toLowerCase())}): ${c.count} products`,
      ),
    '',
    '## Optional',
    '',
    `- [About](${base}/about)`,
    `- [Terms](${base}/terms)`,
    `- [Privacy](${base}/privacy)`,
    '',
  ]
  return lines.join('\n')
}

/** The full dump: every approved listing, grouped by category. */
export function llmsFullTxt(submissions: Submission[]): string {
  const base = siteUrl()
  const byCategory = new Map<string, Submission[]>()
  for (const submission of submissions) {
    const key = submission.category || 'Uncategorized'
    const bucket = byCategory.get(key)
    if (bucket) bucket.push(submission)
    else byCategory.set(key, [submission])
  }

  const sortedCategories = Array.from(byCategory.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )

  const lines: string[] = [
    '# SaaSRow — full directory',
    '',
    `> Every approved listing on SaaSRow (${submissions.length} products), in one file. Structured JSON for any product is at ${base}/api/v1/products/{id}.`,
    '',
  ]

  for (const [category, items] of sortedCategories) {
    lines.push(`## ${category}`, '')
    for (const item of items) {
      lines.push(`### ${item.title}`, '')
      if (item.description) lines.push(item.description, '')
      const facts = [
        bullet('Website', item.url),
        bullet('Listing', `${base}/software/${item.id}`),
        list('Use cases', item.use_cases),
        list('Audiences', item.audiences),
        list('Platforms', item.platforms),
        bullet('Pricing', item.pricing_model),
        list('Alternative to', item.alternatives),
        list('Tags', item.tags),
      ].filter((line): line is string => line !== null)
      if (facts.length) lines.push(...facts, '')
    }
  }

  return lines.join('\n')
}
