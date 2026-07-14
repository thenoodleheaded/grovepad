import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Supabase client — configured entirely through Vite env vars so credentials
// never live in source. Fill these in `.env.local`:
//
//   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<anon/publishable key>
//
// When either is missing the client is null and the app runs local-only:
// the login page explains the situation and guest mode still works.
// ---------------------------------------------------------------------------

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function isConfigured(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('YOUR_')
}

const config = isConfigured(url) && isConfigured(anonKey) ? { url, anonKey } : null

export const supabaseConfigured = config !== null

let clientPromise: Promise<SupabaseClient | null> | null = null

/**
 * Load the cloud SDK only when auth or sync is actually used. Returning guests
 * stay entirely on the local path and never download or parse Supabase.
 */
export function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (!config) return Promise.resolve(null)
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(config.url, config.anonKey))
      .catch((error: unknown) => {
        clientPromise = null
        throw error
      })
  }
  return clientPromise
}
