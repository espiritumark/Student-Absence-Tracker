import { createClient } from '@supabase/supabase-js'

function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl) return rawUrl
  return rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
}

function isPlaceholderConfig(url, anonKey) {
  if (!url || !anonKey) return true
  if (url.includes('YOUR_PROJECT_REF') || anonKey === 'your_anon_key_here') return true
  return false
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL)
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey) && !isPlaceholderConfig(url, anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null
