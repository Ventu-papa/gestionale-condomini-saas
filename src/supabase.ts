import { createClient } from "@supabase/supabase-js"

const publicSupabaseUrl = "https://weqgdvmcoxftsjdhjgbc.supabase.co"
const publicSupabaseAnonKey = "sb_publishable_GbB_x4HCqyajxqkjFWRLxg_j6ypX80J"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || publicSupabaseUrl
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || publicSupabaseAnonKey

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    persistSession: true,
  },
})
