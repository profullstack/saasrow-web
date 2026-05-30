import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get('slug')

    const supabase = getSupabaseAdmin()

    if (slug) {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('status', 'published')
        .eq('slug', slug)
        .maybeSingle()

      if (error) throw error

      return new Response(JSON.stringify({ data: data ?? null }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, slug, title, excerpt, author_name, featured_image_url, tags, published_at, created_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })

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
