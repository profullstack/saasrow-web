import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId') ?? ''
    const submissionId = searchParams.get('submissionId')
    const count = searchParams.get('count')

    if (!userId) {
      return json({ error: 'userId is required' }, 400)
    }

    const supabase = getSupabaseAdmin()

    // Bookmark status for a specific submission
    if (submissionId) {
      const { data, error } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('submission_id', submissionId)
        .maybeSingle()

      if (error) throw error
      return json({ data: { bookmarked: !!data } })
    }

    // Count of the user's favorites
    if (count) {
      const { count: total, error } = await supabase
        .from('favorites')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      if (error) throw error
      return json({ data: { count: total ?? 0 } })
    }

    // Full favorites list with joined approved submissions
    const { data: favorites, error: favoritesError } = await supabase
      .from('favorites')
      .select('submission_id')
      .eq('user_id', userId)

    if (favoritesError) throw favoritesError

    if (!favorites || favorites.length === 0) {
      return json({ data: { favorites: [], submissions: [] } })
    }

    const submissionIds = favorites.map((f) => f.submission_id)

    const { data: submissions, error: subError } = await supabase
      .from('software_submissions')
      .select('*')
      .in('id', submissionIds)
      .eq('status', 'approved')

    if (subError) throw subError

    return json({ data: { favorites: submissionIds, submissions: submissions ?? [] } })
  } catch (error) {
    return json({ error: String(error) }, 500)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const userId = body?.userId
    const submissionId = body?.submissionId

    if (!userId || !submissionId) {
      return json({ error: 'userId and submissionId are required' }, 400)
    }

    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: userId, submission_id: submissionId })

    // Ignore duplicate insert (unique violation)
    if (error && error.code !== '23505') throw error

    return json({ data: { ok: true } })
  } catch (error) {
    return json({ error: String(error) }, 500)
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const userId = body?.userId
    const submissionId = body?.submissionId

    if (!userId || !submissionId) {
      return json({ error: 'userId and submissionId are required' }, 400)
    }

    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('submission_id', submissionId)

    if (error) throw error

    return json({ data: { ok: true } })
  } catch (error) {
    return json({ error: String(error) }, 500)
  }
}
