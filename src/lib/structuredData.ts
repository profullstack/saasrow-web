// JSON-LD builders.
//
// This is the single highest-leverage thing on the site for AI + search
// discovery: without it a listing is just prose in a div, and an assistant has
// to guess what the page is about. With it, the page states outright that it
// describes a SoftwareApplication, what it costs, who rated it and what it
// competes with.
//
// Every builder here is pure so it can be unit-tested without a DOM or a
// network call.

import type { Submission } from './submissions'

export const SITE_NAME = 'SaaSRow'

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.saasrow.com').replace(/\/+$/, '')
}

function storageUrl(bucket: string, path: string): string | undefined {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return undefined
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${path}`
}

/** Prefer the wide screenshot, fall back to the logo. */
export function submissionImageUrl(submission: Submission): string | undefined {
  if (submission.image) return storageUrl('software-images', submission.image)
  if (submission.logo) return storageUrl('software-logos', submission.logo)
  return undefined
}

/** Map our controlled pricing model onto a schema.org Offer. */
function offerFor(submission: Submission) {
  const model = submission.pricing_model
  if (!model) return undefined
  const free = model === 'free' || model === 'open-source'
  return {
    '@type': 'Offer',
    price: free ? '0' : undefined,
    priceCurrency: 'USD',
    category: model,
    availability: 'https://schema.org/InStock',
  }
}

/**
 * schema.org treats an aggregate rating with no votes as invalid, and Google
 * will flag it. Only emit one once at least a single person has voted.
 */
function ratingFor(submission: Submission) {
  const up = submission.upvotes ?? 0
  const down = submission.downvotes ?? 0
  const total = up + down
  if (total < 1) return undefined
  // Map the up/down ratio onto the 1-5 scale schema.org expects.
  const value = 1 + (up / total) * 4
  return {
    '@type': 'AggregateRating',
    ratingValue: Number(value.toFixed(2)),
    bestRating: 5,
    worstRating: 1,
    ratingCount: total,
  }
}

/** Strip undefined keys so the emitted JSON stays clean. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (
      value === undefined ||
      value === null ||
      (Array.isArray(value) && value.length === 0)
    ) {
      delete obj[key]
    }
  }
  return obj
}

export function softwareApplicationLd(submission: Submission) {
  const url = `${siteUrl()}/software/${submission.id}`
  const platforms = submission.platforms ?? []
  return compact({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': url,
    name: submission.title,
    description: submission.description,
    url,
    // The maker's own site — schema.org's `sameAs` is how a crawler links our
    // listing back to the canonical product.
    sameAs: submission.url ? [submission.url] : undefined,
    applicationCategory: submission.category,
    applicationSubCategory: submission.use_cases?.length
      ? submission.use_cases.join(', ')
      : undefined,
    operatingSystem: platforms.length ? platforms.join(', ') : undefined,
    image: submissionImageUrl(submission),
    keywords: submission.tags?.length ? submission.tags.join(', ') : undefined,
    audience: submission.audiences?.length
      ? submission.audiences.map((a) => ({ '@type': 'Audience', audienceType: a }))
      : undefined,
    offers: offerFor(submission),
    aggregateRating: ratingFor(submission),
    interactionStatistic: submission.view_count
      ? {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/ViewAction',
          userInteractionCount: submission.view_count,
        }
      : undefined,
    isSimilarTo: submission.alternatives?.length
      ? submission.alternatives.map((name) => ({ '@type': 'SoftwareApplication', name }))
      : undefined,
    datePublished: submission.created_at,
  })
}

/** Breadcrumbs give search engines the category path for a listing. */
export function breadcrumbLd(submission: Submission) {
  const base = siteUrl()
  const items = [
    { name: 'Home', item: base },
    { name: 'Categories', item: `${base}/categories` },
  ]
  if (submission.category) {
    items.push({
      name: submission.category,
      item: `${base}/category/${encodeURIComponent(submission.category.toLowerCase())}`,
    })
  }
  items.push({ name: submission.title, item: `${base}/software/${submission.id}` })

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  }
}

/** An ItemList turns a category or search page into a machine-readable ranking. */
export function itemListLd(
  submissions: Submission[],
  { name, url }: { name: string; url: string },
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url,
    numberOfItems: submissions.length,
    itemListElement: submissions.map((submission, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${siteUrl()}/software/${submission.id}`,
      name: submission.title,
    })),
  }
}

/**
 * Site-level identity plus a SearchAction, which is what lets an assistant (or
 * Google) query the directory directly instead of scraping a listing page.
 */
export function websiteLd() {
  const base = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${base}#website`,
    name: SITE_NAME,
    url: base,
    description:
      'A directory of software and SaaS products, published as structured data for humans, search engines and AI agents.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${base}/explore?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function organizationLd() {
  const base = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${base}#organization`,
    name: SITE_NAME,
    url: base,
    logo: `${base}/social.png`,
  }
}
