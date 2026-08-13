// Pure helpers usable from both server and client / tests.
// (Server-only network code lives in src/lib/api.ts.)

export interface Submission {
  id: string
  title: string
  url: string
  description: string
  category: string
  email?: string
  status: string
  created_at: string
  updated_at?: string
  submitted_at?: string
  logo?: string
  image?: string
  tags?: string[]
  view_count?: number
  tier?: string
  upvotes?: number
  downvotes?: number
  share_count?: number
  last_share_reset?: string
  featured?: boolean
  homepage_featured?: boolean
  // Controlled-vocabulary fields (see src/lib/vocab.ts). Optional because the
  // 300-odd listings that predate them have not been backfilled.
  use_cases?: string[]
  audiences?: string[]
  platforms?: string[]
  pricing_model?: string
  alternatives?: string[]
}

export interface CategoryCount {
  name: string
  count: number
}

export interface TagCount {
  name: string
  count: number
}

export function filterByCategory(submissions: Submission[], category: string): Submission[] {
  const target = category.toLowerCase()
  return submissions.filter((s) => s.category?.toLowerCase() === target)
}

export function filterByTag(submissions: Submission[], tag: string): Submission[] {
  const target = tag.toLowerCase()
  return submissions.filter(
    (s) => Array.isArray(s.tags) && s.tags.some((t) => t.toLowerCase() === target),
  )
}

export function categoryCountsFrom(submissions: Submission[]): CategoryCount[] {
  const map = new Map<string, number>()
  for (const sub of submissions) {
    if (!sub.category) continue
    map.set(sub.category, (map.get(sub.category) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

export function tagCountsFrom(submissions: Submission[]): TagCount[] {
  const map = new Map<string, number>()
  for (const sub of submissions) {
    if (!Array.isArray(sub.tags)) continue
    for (const t of sub.tags) {
      map.set(t, (map.get(t) ?? 0) + 1)
    }
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}
