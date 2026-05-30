import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import {
  validateAdminToken,
  adminTokenFromRequest,
  jsonResponse,
  unauthorized,
} from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

/**
 * Admin user/account management. All direct supabase.from(...) DB work that used
 * to run in the browser inside src/views/Admin.tsx (the "Users" section) now runs
 * here, behind a server-side admin-token check, using the service-role client.
 *
 * Actions (POST body { action, ... }):
 *  - 'upgrade'   { email, tier }           upgrade a user to featured/premium
 *  - 'downgrade' { email }                 downgrade a user to free
 *  - 'delete'    { email }                 delete a user account + all related data
 *  - 'submissions' { email }               list a user's submissions
 */
export async function POST(req: Request) {
  const { ok } = await validateAdminToken(adminTokenFromRequest(req))
  if (!ok) return unauthorized()

  let body: { action?: string; email?: string; tier?: 'featured' | 'premium' }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { action, email, tier } = body
  const supabase = getSupabaseAdmin()

  try {
    switch (action) {
      case 'upgrade': {
        if (!email || !tier) return jsonResponse({ error: 'email and tier are required' }, 400)

        const { data: existingToken } = await supabase
          .from('user_tokens')
          .select('id')
          .eq('email', email)
          .maybeSingle()

        if (existingToken) {
          const { error } = await supabase
            .from('user_tokens')
            .update({ tier })
            .eq('email', email)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('user_tokens')
            .insert({
              email,
              tier,
              expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            })
          if (error) throw error
        }

        const { data: contacts } = await supabase
          .from('submission_contacts')
          .select('submission_id')
          .eq('email', email)

        if (contacts && contacts.length > 0) {
          const submissionIds = contacts.map((c) => c.submission_id)
          const { error: updateSubmissionsError } = await supabase
            .from('software_submissions')
            .update({ tier })
            .in('id', submissionIds)
          if (updateSubmissionsError) throw updateSubmissionsError
        }

        return jsonResponse({ data: { ok: true } })
      }

      case 'downgrade': {
        if (!email) return jsonResponse({ error: 'email is required' }, 400)

        const { error: deleteTokenError } = await supabase
          .from('user_tokens')
          .delete()
          .eq('email', email)
        if (deleteTokenError) throw deleteTokenError

        const { data: contacts } = await supabase
          .from('submission_contacts')
          .select('submission_id')
          .eq('email', email)

        if (contacts && contacts.length > 0) {
          const submissionIds = contacts.map((c) => c.submission_id)
          const { error: updateSubmissionsError } = await supabase
            .from('software_submissions')
            .update({ tier: 'free' })
            .in('id', submissionIds)
          if (updateSubmissionsError) throw updateSubmissionsError
        }

        return jsonResponse({ data: { ok: true } })
      }

      case 'delete': {
        if (!email) return jsonResponse({ error: 'email is required' }, 400)

        const { data: contacts } = await supabase
          .from('submission_contacts')
          .select('submission_id')
          .eq('email', email)

        if (contacts && contacts.length > 0) {
          const submissionIds = contacts.map((c) => c.submission_id)

          await supabase.from('social_links').delete().in('submission_id', submissionIds)
          await supabase.from('submission_clicks').delete().in('submission_id', submissionIds)
          await supabase
            .from('submission_analytics_daily')
            .delete()
            .in('submission_id', submissionIds)
          await supabase.from('submission_screenshots').delete().in('submission_id', submissionIds)
          await supabase.from('submission_contacts').delete().in('submission_id', submissionIds)
          await supabase.from('software_submissions').delete().in('id', submissionIds)
        }

        await supabase.from('user_tokens').delete().eq('email', email)

        return jsonResponse({ data: { ok: true } })
      }

      case 'submissions': {
        if (!email) return jsonResponse({ error: 'email is required' }, 400)

        const { data: contacts } = await supabase
          .from('submission_contacts')
          .select('submission_id')
          .eq('email', email)

        if (!contacts || contacts.length === 0) {
          return jsonResponse({ data: [] })
        }

        const submissionIds = contacts.map((c) => c.submission_id)

        const { data, error } = await supabase
          .from('software_submissions')
          .select('*')
          .in('id', submissionIds)
          .order('created_at', { ascending: false })

        if (error) throw error

        return jsonResponse({ data })
      }

      default:
        return jsonResponse({ error: 'Unknown action' }, 400)
    }
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
}
