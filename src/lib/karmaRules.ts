// Pure karma helpers, shared by the server routes and the pages. The points
// themselves live in the karma_rules table (see the karma migration); this file
// holds the input rules and the arithmetic the UI needs.

export const KARMA_PER_CREDIT = 500
export const FEATURED_WEEK_DAYS = 7

export const MIN_COMMENT_CHARS = 10
export const MIN_REVIEW_CHARS = 30
export const MAX_COMMENT_CHARS = 2000

/** The networks a tracked share button can name. Only these pay. */
export const SHARE_NETWORKS = ['x', 'bluesky', 'linkedin', 'reddit', 'hn', 'copy'] as const
export type ShareNetwork = (typeof SHARE_NETWORKS)[number]

export const PERIODS = ['week', 'month', 'all'] as const
export type Period = (typeof PERIODS)[number]

export function isShareNetwork(value: unknown): value is ShareNetwork {
  return typeof value === 'string' && (SHARE_NETWORKS as readonly string[]).includes(value)
}

export function parsePeriod(value: unknown): Period {
  return typeof value === 'string' && (PERIODS as readonly string[]).includes(value) ? (value as Period) : 'week'
}

/** A comment with a star rating and enough words is a review (+5 instead of +2). */
export function isReview(content: string, rating: unknown): boolean {
  return typeof rating === 'number' && rating >= 1 && rating <= 5 && content.trim().length >= MIN_REVIEW_CHARS
}

/** UTC day, the bucket for once-a-day actions. */
export const dayOf = (d: Date = new Date()) => d.toISOString().slice(0, 10)

/**
 * Where the next free Featured week lands. `granted` is the highest milestone
 * already granted, so a dip in karma never re-offers a credit already given.
 */
export function nextCredit(total: number, granted = 0, per = KARMA_PER_CREDIT) {
  const reached = Math.max(granted, Math.floor(Math.max(total, 0) / per))
  const at = (reached + 1) * per
  return { at, remaining: at - total, per, progress: Math.max(0, Math.min(1, 1 - (at - total) / per)) }
}

export interface KarmaBadge {
  id: string
  emoji: string
  label: string
}

const BADGES: Array<KarmaBadge & { min: number }> = [
  { id: 'first-karma', emoji: '✨', label: 'First karma', min: 10 },
  { id: 'karma-100', emoji: '💯', label: '100 karma', min: 100 },
  { id: 'karma-1000', emoji: '🌟', label: '1,000 karma', min: 1000 },
]

/** Badges are derived from all-time karma and board ranks; nothing to store. */
export function badgesFor(total: number, ranks: Partial<Record<Period, number>> = {}): KarmaBadge[] {
  const out: KarmaBadge[] = BADGES.filter((b) => total >= b.min).map(({ id, emoji, label }) => ({ id, emoji, label }))
  if ((ranks.week ?? Infinity) <= 10) out.push({ id: 'top-ten-week', emoji: '🏅', label: 'Top ten this week' })
  if (Object.values(ranks).includes(1)) out.push({ id: 'number-one', emoji: '👑', label: 'Number one' })
  return out
}

/** A display name a member may set: 2-40 printable characters, no '@' (never an email). */
export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 40 || name.includes('@')) return null
  return name
}
