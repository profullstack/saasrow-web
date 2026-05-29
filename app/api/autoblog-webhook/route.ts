import { createClient } from '@supabase/supabase-js'
import { verifyAndParse } from '@profullstack/autoblog'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
}

function uniqueSlug(base: string): string {
  return `${base}-${Date.now()}`
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return new Response('Server misconfiguration', { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    const { data: config } = await supabase
      .from('autoblog_config')
      .select('webhook_secret, enabled')
      .maybeSingle()

    if (!config?.enabled) {
      return new Response('Webhook disabled', { status: 403 })
    }

    if (!config.webhook_secret) {
      return new Response('Webhook secret not configured', { status: 500 })
    }

    const body = await req.text()
    const headers = Object.fromEntries(req.headers)

    const result = verifyAndParse({
      headers,
      body,
      opts: { secret: config.webhook_secret },
    })

    if (!result.ok) {
      return new Response(result.reason ?? 'Unauthorized', { status: result.status ?? 401 })
    }

    const post = result.post

    const baseSlug = post.slug || slugify(post.title || 'untitled')

    const row = {
      external_id: post.id ?? null,
      slug: baseSlug,
      title: post.title ?? '',
      excerpt: post.excerpt ?? '',
      content: post.html ?? '',
      markdown: post.markdown ?? '',
      status: post.status ?? 'published',
      author_name: post.author?.name ?? '',
      author_url: post.author?.url ?? '',
      featured_image_url: post.featured_image?.url ?? '',
      featured_image_alt: post.featured_image?.alt ?? '',
      tags: post.tags ?? [],
      categories: post.categories ?? [],
      source_url: post.canonical_url || post.url || '',
      published_at: post.published_at ?? new Date().toISOString(),
      updated_at: post.updated_at ?? new Date().toISOString(),
    }

    // Upsert by external_id when present, otherwise insert
    if (row.external_id) {
      const { error } = await supabase
        .from('blog_posts')
        .upsert(row, { onConflict: 'external_id' })

      if (error) {
        console.error('blog_posts upsert error:', error)
        return new Response('Database error', { status: 500 })
      }
    } else {
      // No external_id — insert, handling potential slug collision
      const { error } = await supabase.from('blog_posts').insert(row)

      if (error?.code === '23505') {
        // Slug collision — make it unique
        const { error: e2 } = await supabase
          .from('blog_posts')
          .insert({ ...row, slug: uniqueSlug(baseSlug) })
        if (e2) {
          console.error('blog_posts insert retry error:', e2)
          return new Response('Database error', { status: 500 })
        }
      } else if (error) {
        console.error('blog_posts insert error:', error)
        return new Response('Database error', { status: 500 })
      }
    }

    return new Response(null, { status: 200 })
  } catch (err) {
    console.error('autoblog webhook error:', err)
    return new Response('Internal server error', { status: 500 })
  }
}
