import { createSupabaseServerClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const submissionId = searchParams.get('submissionId') ?? ''

    if (!submissionId) {
      return new Response(JSON.stringify({ error: 'submissionId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const sb = await createSupabaseServerClient()
    const { data: { user } } = await sb.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ data: null }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await sb
      .from('votes')
      .select('vote_type')
      .eq('submission_id', submissionId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error

    return new Response(JSON.stringify({ data: data ?? null }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
