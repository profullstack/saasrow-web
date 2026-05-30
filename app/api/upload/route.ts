import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ALLOWED_BUCKETS = ['software-logos', 'software-images']

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const bucket = form.get('bucket')
    const path = form.get('path')
    const file = form.get('file')

    if (typeof bucket !== 'string' || !ALLOWED_BUCKETS.includes(bucket)) {
      return new Response(JSON.stringify({ error: 'Invalid bucket' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (typeof path !== 'string' || !path) {
      return new Response(JSON.stringify({ error: 'path is required' }), {
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
