import 'server-only'
import { getSupabaseAdmin } from './supabaseAdmin'
import { callEdgeFunction } from './edgeProxy'
import { ApiError } from './publicApi'
import type { ApiPrincipal } from './apiAuth'
import {
  KARMA_PER_CREDIT,
  MAX_COMMENT_CHARS,
  MIN_COMMENT_CHARS,
  badgesFor,
  dayOf,
  isReview,
  isShareNetwork,
  nextCredit,
  normalizeDisplayName,
  type Period,
} from './karmaRules'

// Karma for signed-in members: the same points table as built.indie and pwamart.
// The ledger, caps, dedupe and credits live in Postgres (award_karma and friends,
// see the karma migration); this file is the member-facing actions that pay
// through it. Anonymous votes and comments keep using the edge functions and earn
// nothing.

export interface KarmaResult {
  paid: boolean
  points?: number
  total?: number
  credits?: number
  reason?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function karmaRules() {
  const { data, error } = await getSupabaseAdmin()
    .from('karma_rules')
    .select('action, points, daily_cap, label, rule')
    .eq('live', true)
    .order('sort')
  if (error) throw new Error(`karmaRules failed: ${error.message}`)
  return data ?? []
}

export async function award(
  userId: string,
  action: string,
  ref: string,
  opts: { bucket?: string; submissionId?: string } = {},
): Promise<KarmaResult> {
  const { data, error } = await getSupabaseAdmin().rpc('award_karma', {
    p_user: userId,
    p_action: action,
    p_ref: ref,
    p_bucket: opts.bucket ?? '',
    p_submission: opts.submissionId ?? null,
  })
  if (error) throw new Error(`award_karma failed: ${error.message}`)
  return data as KarmaResult
}

async function ownerOf(submissionId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().rpc('listing_owner', { p_submission: submissionId })
  if (error) throw new Error(`listing_owner failed: ${error.message}`)
  return (data as string | null) ?? null
}

async function approvedListing(id: string): Promise<{ id: string; title: string }> {
  if (!UUID_RE.test(id)) throw new ApiError(404, 'No such product')
  const { data } = await getSupabaseAdmin()
    .from('software_submissions')
    .select('id, title')
    .eq('id', id)
    .eq('status', 'approved')
    .maybeSingle()
  if (!data) throw new ApiError(404, 'No such product')
  return data as { id: string; title: string }
}

// ---------------------------------------------------------------- votes --

type VoteType = 'upvote' | 'downvote'

async function voteCounts(id: string) {
  const { data } = await getSupabaseAdmin()
    .from('software_submissions')
    .select('upvotes, downvotes')
    .eq('id', id)
    .single()
  return { upvotes: data?.upvotes ?? 0, downvotes: data?.downvotes ?? 0 }
}

export async function myVote(principal: ApiPrincipal, id: string) {
  await approvedListing(id)
  const { data } = await getSupabaseAdmin()
    .from('votes')
    .select('vote_type')
    .eq('submission_id', id)
    .eq('user_id', principal.userId)
    .maybeSingle()
  return { voteType: (data?.vote_type as VoteType | undefined) ?? null, ...(await voteCounts(id)) }
}

/**
 * Same toggle as the vote edge function: the same vote again removes it, the
 * other one switches. A member's first upvote on a product pays them +1 and its
 * owner +1; un-voting takes nothing back, and voting again pays nothing more
 * (the ledger already holds that row).
 */
export async function memberVote(principal: ApiPrincipal, id: string, voteType: unknown) {
  if (voteType !== 'upvote' && voteType !== 'downvote') {
    throw new ApiError(400, 'vote_type must be "upvote" or "downvote"')
  }
  await approvedListing(id)
  const supabase = getSupabaseAdmin()
  const { data: existing } = await supabase
    .from('votes')
    .select('id, vote_type')
    .eq('submission_id', id)
    .eq('user_id', principal.userId)
    .maybeSingle()

  let action: 'created' | 'updated' | 'removed'
  let current: VoteType | null
  if (existing && existing.vote_type === voteType) {
    const { error } = await supabase.from('votes').delete().eq('id', existing.id)
    if (error) throw new Error(`vote delete failed: ${error.message}`)
    action = 'removed'
    current = null
  } else if (existing) {
    const { error } = await supabase.from('votes').update({ vote_type: voteType }).eq('id', existing.id)
    if (error) throw new Error(`vote update failed: ${error.message}`)
    action = 'updated'
    current = voteType
  } else {
    const { error } = await supabase
      .from('votes')
      .insert({ submission_id: id, user_id: principal.userId, vote_type: voteType, is_anonymous: false })
    if (error) throw new Error(`vote insert failed: ${error.message}`)
    action = 'created'
    current = voteType
  }

  let karma: KarmaResult | null = null
  if (current === 'upvote') {
    const owner = await ownerOf(id)
    if (owner === principal.userId) {
      karma = { paid: false, reason: 'your own product' }
    } else {
      karma = await award(principal.userId, 'vote', id, { submissionId: id })
      if (owner) await award(owner, 'received_vote', `${id}:${principal.userId}`, { submissionId: id })
    }
  }
  return { action, voteType: current, ...(await voteCounts(id)), karma }
}

// ------------------------------------------------------------- comments --

async function displayNameOf(userId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin().from('users').select('display_name').eq('id', userId).maybeSingle()
  return (data?.display_name as string | null) ?? null
}

/**
 * A signed-in member's comment is public at once (like a Supabase-session one
 * was). With a star rating and 30+ characters it is a review: +5 once per
 * product and +2 to the owner; otherwise +2, up to 10 a day.
 */
export async function memberComment(principal: ApiPrincipal, id: string, input: unknown) {
  const body = (input ?? {}) as Record<string, unknown>
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (content.length < MIN_COMMENT_CHARS || content.length > MAX_COMMENT_CHARS) {
    throw new ApiError(400, `Comments are ${MIN_COMMENT_CHARS} to ${MAX_COMMENT_CHARS} characters`)
  }
  const rating = body.rating == null || body.rating === 0 ? null : Number(body.rating)
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
    throw new ApiError(400, 'rating must be a whole number from 1 to 5')
  }
  await approvedListing(id)

  // A name typed into the form becomes the member's display name the first time.
  let name = await displayNameOf(principal.userId)
  const typed = normalizeDisplayName(body.author_name)
  if (!name && typed) {
    await getSupabaseAdmin().from('users').update({ display_name: typed }).eq('id', principal.userId)
    name = typed
  }

  const supabase = getSupabaseAdmin()
  const { data: comment, error } = await supabase
    .from('comments')
    .insert({
      submission_id: id,
      author_name: typed ?? name ?? 'SaaSRow member',
      author_email: principal.email,
      content,
      rating,
      is_verified: true,
      user_id: principal.userId,
    })
    .select('id, submission_id, author_name, content, rating, created_at, is_verified')
    .single()
  if (error) throw new Error(`comment insert failed: ${error.message}`)

  let karma: KarmaResult
  const owner = await ownerOf(id)
  if (owner === principal.userId) {
    karma = { paid: false, reason: 'your own product' }
  } else {
    karma = { paid: false }
    if (isReview(content, rating)) {
      karma = await award(principal.userId, 'review', id, { submissionId: id })
      if (karma.paid && owner) {
        await award(owner, 'received_review', `${id}:${principal.userId}`, { submissionId: id })
      }
    }
    // Not a review, or this product's review was already paid: an ordinary comment.
    if (!karma.paid) karma = await award(principal.userId, 'comment', comment.id, { submissionId: id })
  }

  // The owner and fellow commenters hear about it; the function is idempotent.
  try {
    await callEdgeFunction(
      'notify-comment',
      { commentId: comment.id },
      { 'x-service-key': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '' },
    )
  } catch (err) {
    console.error('[karma] notify-comment failed:', err)
  }

  return { comment, karma }
}

/** Delete your own comment; the delete trigger takes its karma back. */
export async function deleteMemberComment(principal: ApiPrincipal, commentId: string) {
  if (!UUID_RE.test(commentId)) throw new ApiError(404, 'No such comment')
  const { data, error } = await getSupabaseAdmin()
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', principal.userId)
    .select('id')
  if (error) throw new Error(`comment delete failed: ${error.message}`)
  if (!data?.length) throw new ApiError(404, 'No such comment of yours')
  return { deleted: true, id: commentId }
}

// --------------------------------------------------------------- shares --

/** +1 per product per network a day, up to 5 a day; never on your own product. */
export async function memberShare(principal: ApiPrincipal, id: string, network: unknown) {
  if (!isShareNetwork(network)) throw new ApiError(400, 'network must be one of x, bluesky, linkedin, reddit, hn, copy')
  await approvedListing(id)
  if ((await ownerOf(id)) === principal.userId) return { karma: { paid: false, reason: 'your own product' } }
  return { karma: await award(principal.userId, 'share', `${id}:${network}`, { bucket: dayOf(), submissionId: id }) }
}

// ------------------------------------------------------- summary + board --

export async function leaderboard(period: Period, limit = 25) {
  const { data, error } = await getSupabaseAdmin().rpc('karma_leaderboard', { p_period: period, p_limit: limit })
  if (error) throw new Error(`karma_leaderboard failed: ${error.message}`)
  return ((data ?? []) as Array<{ rank: number; player: string; name: string; karma: number }>).map((r) => ({
    rank: Number(r.rank),
    player: r.player,
    name: r.name,
    karma: Number(r.karma),
  }))
}

/** Top karma this week, falling back to all time so the widget is never empty. */
export async function topKarma(limit = 5) {
  const week = await leaderboard('week', limit)
  if (week.length) return { period: 'week' as const, rows: week }
  return { period: 'all' as const, rows: await leaderboard('all', limit) }
}

/** The board's public id for a member: karma_player_id() in SQL, the one definition. */
async function playerIdOf(userId: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin().rpc('karma_player_id', { p_user: userId })
  if (error) throw new Error(`karma_player_id failed: ${error.message}`)
  return data as string
}

/** Everything the /karma page shows: total, this week, credits, the next one, history. */
export async function karmaSummary(principal: ApiPrincipal, limit = 30) {
  const supabase = getSupabaseAdmin()
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [{ data: events, error }, { data: credits }, { data: user }, rules, week, all] = await Promise.all([
    supabase
      .from('karma_events')
      .select('action, points, bucket, created_at, submission_id, software_submissions(title)')
      .eq('user_id', principal.userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(5000),
    supabase
      .from('karma_credits')
      .select('id, milestone, granted_at, spent_at, featured_until, submission_id, software_submissions(title)')
      .eq('user_id', principal.userId)
      .order('milestone'),
    supabase.from('users').select('display_name, is_staff').eq('id', principal.userId).maybeSingle(),
    karmaRules(),
    leaderboard('week', 100),
    leaderboard('all', 100),
  ])
  if (error) throw new Error(`karma summary failed: ${error.message}`)

  type EventRow = {
    action: string
    points: number
    bucket: string
    created_at: string
    submission_id: string | null
    software_submissions: { title: string } | { title: string }[] | null
  }
  const rows = (events ?? []) as unknown as EventRow[]
  const title = (s: EventRow['software_submissions']) => (Array.isArray(s) ? s[0]?.title : s?.title) ?? null
  const total = rows.reduce((n, e) => n + e.points, 0)
  const weekTotal = rows.filter((e) => e.created_at >= since).reduce((n, e) => n + e.points, 0)
  const labels = new Map(rules.map((r: { action: string; label: string }) => [r.action, r.label]))

  const player = await playerIdOf(principal.userId)
  const ranks: Partial<Record<Period, number>> = {
    week: week.find((r) => r.player === player)?.rank,
    all: all.find((r) => r.player === player)?.rank,
  }
  type CreditRow = {
    id: string
    milestone: number
    granted_at: string
    spent_at: string | null
    featured_until: string | null
    submission_id: string | null
    software_submissions: EventRow['software_submissions']
  }
  const creditRows = (credits ?? []) as unknown as CreditRow[]
  const granted = creditRows.reduce((m, c) => Math.max(m, c.milestone), 0)

  return {
    total,
    week: weekTotal,
    player,
    display_name: (user?.display_name as string | null) ?? null,
    staff: Boolean(user?.is_staff),
    ranks,
    badges: badgesFor(total, ranks),
    credits: {
      available: creditRows.filter((c) => !c.spent_at).length,
      granted: creditRows.length,
      spent: creditRows.filter((c) => c.spent_at).length,
      list: creditRows.map((c) => ({
        id: c.id,
        milestone: c.milestone * KARMA_PER_CREDIT,
        granted_at: c.granted_at,
        spent_at: c.spent_at,
        featured_until: c.featured_until,
        product: c.submission_id ? { id: c.submission_id, title: title(c.software_submissions) } : null,
      })),
    },
    next_credit: nextCredit(total, granted),
    events: rows.slice(0, Math.min(Math.max(limit, 1), 200)).map((e) => ({
      action: e.action,
      label: labels.get(e.action) ?? e.action,
      points: e.points,
      reversal: e.bucket === 'reversed',
      at: e.created_at,
      product: e.submission_id ? { id: e.submission_id, title: title(e.software_submissions) } : null,
    })),
    how_to_earn: rules,
  }
}

/** Spend one free Featured week on a listing you own. */
export async function redeemCredit(principal: ApiPrincipal, listingId: unknown) {
  if (typeof listingId !== 'string' || !UUID_RE.test(listingId)) throw new ApiError(400, 'listing_id (uuid) is required')
  const { data, error } = await getSupabaseAdmin().rpc('spend_karma_credit', {
    p_user: principal.userId,
    p_submission: listingId,
  })
  if (error) throw new Error(`spend_karma_credit failed: ${error.message}`)
  const out = data as { error?: string; status?: number; featured?: boolean; featured_until?: string; credits_left?: number }
  if (out.error) throw new ApiError(out.status ?? 400, out.error)
  return out
}

export async function setDisplayName(principal: ApiPrincipal, value: unknown) {
  const name = normalizeDisplayName(value)
  if (!name) throw new ApiError(400, 'display_name is 2 to 40 characters and cannot contain "@"')
  const { error } = await getSupabaseAdmin().from('users').update({ display_name: name }).eq('id', principal.userId)
  if (error) throw new Error(`display name update failed: ${error.message}`)
  return { display_name: name }
}
