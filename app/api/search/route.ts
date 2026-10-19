import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request) {
  try {
    const supabase = getSupabaseAdmin()
    const data = await fetchAllRows((from, to) => supabase
      .from('software_submissions')
      .select('tags')
      .eq('status', 'approved')
      .not('tags', 'is', null)
      .order('id', { ascending: true })
      .range(from, to))

    return new Response(JSON.stringify({ data }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
