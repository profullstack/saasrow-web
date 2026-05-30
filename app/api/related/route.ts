import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const currentId = searchParams.get('id') ?? ''
    const category = searchParams.get('category') ?? ''
    const tags = searchParams.getAll('tags').filter(Boolean)

    const supabase = getSupabaseAdmin()
    const columns = 'id, title, description, logo, category, tier, upvotes'

    let query = supabase
      .from('software_submissions')
      .select(columns)
      .eq('status', 'approved')
      .neq('id', currentId)
      .limit(6)

    if (tags.length > 0) {
      query = query.overlaps('tags', tags)
    } else {
      query = query.eq('category', category)
    }

    const { data, error } = await query.order('upvotes', { ascending: false })
    if (error) throw error

    let result = data ?? []

    if (data && data.length < 3 && tags.length > 0) {
      const { data: categoryData, error: catError } = await supabase
        .from('software_submissions')
        .select(columns)
        .eq('status', 'approved')
        .eq('category', category)
        .neq('id', currentId)
        .not('id', 'in', `(${data.map((d) => d.id).join(',')})`)
        .order('upvotes', { ascending: false })
        .limit(6 - data.length)

      if (catError) throw catError
      if (categoryData) {
        result = [...data, ...categoryData]
      }
    }

    return new Response(JSON.stringify({ data: result }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
