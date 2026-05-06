import { createClient } from "@supabase/supabase-js"

const supabaseUrl = "https://weqgdvmcoxftsjdhjgbc.supabase.co"
const supabaseAnonKey = "sb_publishable_GbB_x4HCqyajxqkjFWRLxg_j6ypX80J"

export const supabase = createClient(supabaseUrl, supabaseAnonKey)