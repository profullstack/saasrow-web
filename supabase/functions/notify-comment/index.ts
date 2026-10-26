// Tells a listing's owner and fellow commenters that a member's comment went up.
//
// Member comments are written by the Next side (src/lib/karma.ts), which has no
// mail credentials, so it calls this with the service-role key in X-Service-Key.
// The comment's notified_at is claimed first: a retry or a replay never mails
// anyone twice.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { notifyCommentPublished } from '../_shared/commentNotify.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!serviceKey || req.headers.get('x-service-key') !== serviceKey) {
    return json({ error: 'Unauthorized' }, 401)
  }

  try {
    const { commentId } = await req.json().catch(() => ({}))
    if (typeof commentId !== 'string' || !commentId) return json({ error: 'commentId is required' }, 400)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)
    const { data: claimed, error } = await supabase
      .from('comments')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('is_verified', true)
      .is('notified_at', null)
      .select('id')
    if (error) return json({ error: error.message }, 500)
    if (!claimed?.length) return json({ notified: false })

    await notifyCommentPublished(supabase, [commentId])
    return json({ notified: true })
  } catch (error) {
    console.error('notify-comment error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
})
