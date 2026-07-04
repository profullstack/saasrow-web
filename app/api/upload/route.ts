import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ALLOWED_BUCKETS = ['software-logos', 'software-images']

// This route uses the service-role client (bypasses storage RLS) with no
// session/ownership check, since anonymous visitors legitimately upload a
// logo/screenshot while submitting a new listing (see src/views/Submit.tsx).
// That's fine, but the request body was otherwise fully attacker-controlled:
// no size cap, no content-type allowlist, and the storage key itself came
// straight from the client instead of being derived server-side. Any caller
// hitting this endpoint directly (skipping the frontend) could write
// arbitrary content/size to any key in these buckets, unlike every other
// mutating endpoint in this codebase.
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const bucket = form.get('bucket')
    const file = form.get('file')

    if (typeof bucket !== 'string' || !ALLOWED_BUCKETS.includes(bucket)) {
      return new Response(JSON.stringify({ error: 'Invalid bucket' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'file is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
      return new Response(JSON.stringify({ error: 'Unsupported file type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (file.size > MAX_FILE_BYTES) {
      return new Response(JSON.stringify({ error: 'File too large (max 5MB)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Derive the storage key server-side instead of trusting a client-supplied
    // path, so a caller can't collide with/squat another upload's key or write
    // outside the intended flat filename pattern.
    const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`

    const { error } = await getSupabaseAdmin()
      .storage.from(bucket)
      .upload(path, file, { upsert: false, contentType: file.type })

    if (error) throw error

    return new Response(JSON.stringify({ data: { path } }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
