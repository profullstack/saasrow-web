import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'no-store' }

// Health check for status.profullstack.com: one cheap PostgREST HEAD query,
// capped at 3s. Never echoes the error, so nothing about the setup leaks.
export async function GET() {
  try {
    const { error } = await getSupabaseAdmin()
      .from('software_submissions')
      .select('id', { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(3000))
    if (error) throw error
    return Response.json({ status: 'ok', db: 'ok' }, { headers })
  } catch {
    return Response.json({ status: 'error', db: 'down' }, { status: 503, headers })
  }
}
