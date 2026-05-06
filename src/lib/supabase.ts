import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | undefined

function getSupabaseClient() {
  if (!supabaseInstance) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase env vars not available, using mock client')
      return new Proxy({} as SupabaseClient, {
        get: () => {
          throw new Error('Supabase client not properly initialized')
        }
      })
    }

    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
  }
  return supabaseInstance
}

export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    return getSupabaseClient()[prop as keyof SupabaseClient]
  }
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
