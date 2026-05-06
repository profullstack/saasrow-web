import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | undefined

export function getBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase env vars not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)')
  }
  browserClient = createBrowserClient(url, anonKey)
  return browserClient
}

export const supabase = new Proxy({} as SupabaseClient, {
  get: (_target, prop) => {
    const client = getBrowserSupabase()
    return client[prop as keyof SupabaseClient]
  },
})

export type NewsletterSubscription = {
  id: string
  email: string
  subscribed_at: string
  is_active: boolean
  created_at: string
}

export type SoftwareSubmission = {
  id: string
  title: string
  url: string
  description: string
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
  created_at: string
}

export type CommunityPost = {
  id: string
  author: string
  title: string
  excerpt: string
  likes: number
  comments: number
  created_at: string
  updated_at: string
}
