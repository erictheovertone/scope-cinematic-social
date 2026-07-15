import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database Types
export interface User {
  id: string
  privy_id: string
  wallet_address?: string
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  user_id: string
  display_name: string
  username: string
  bio: string
  profile_image_url?: string
  grid_layout?: string
  /** "While you were away" recap: last app-entry the viewer dismissed the recap at
   *  (the cutoff for the next recap), and whether to show it on return (default ON). */
  last_seen_at?: string | null
  show_recap?: boolean | null
  kit_camera?: string
  kit_lens?: string
  kit_favorite_tool?: string
  contact_email?: string
  contact_email_public?: boolean
  portfolio_mc?: number
  created_at: string
  updated_at: string
}

export interface Post {
  id: string
  user_id: string
  image_url: string
  caption: string
  grid_layout: string
  token_id?: string
  created_at: string
  updated_at: string
  music_track_id?: string | null
  music_mode?: 'bed' | 'music_only' | null
}

// Helper functions
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  return { error }
}
