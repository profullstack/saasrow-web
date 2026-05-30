import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request) {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('software_submissions')
      .select('tags')
      .eq('status', 'approved')
      .not('tags', 'is', null)

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
