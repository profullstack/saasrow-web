import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const submissionId = searchParams.get('submissionId') ?? ''

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('submission_screenshots')
      .select('*')
      .eq('submission_id', submissionId)
      .order('captured_at', { ascending: true })

    if (error) throw error

    return new Response(JSON.stringify({ data: data ?? [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
