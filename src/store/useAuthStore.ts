import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient, supabaseConfigured } from '../lib/supabase'

// ---------------------------------------------------------------------------
// Auth session state. The login page gates the app until either a Supabase
// session exists or the user chooses guest mode (local-first, per the Grove
// philosophy). The guest choice persists so returning users go straight in.
// ---------------------------------------------------------------------------

const GUEST_KEY = 'grovepad:guest:v1'

function loadGuestChoice(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === 'true'
  } catch {
    return false
  }
}

export interface AuthState {
  session: Session | null
  /** True until the initial getSession() resolves — prevents a login flash. */
  loading: boolean
  isGuest: boolean

  continueAsGuest: () => void
  /** Leave guest mode and show the login page again. */
  exitGuest: () => void
  signOut: () => Promise<void>
}

const initialGuest = loadGuestChoice()

export const useAuthStore = create<AuthState>()((set) => ({
  session: null,
  loading: supabaseConfigured && !initialGuest,
  isGuest: initialGuest,

  continueAsGuest: () => {
    try {
      localStorage.setItem(GUEST_KEY, 'true')
    } catch {
      // Storage unavailable — guest mode still works for this session.
    }
    set({ isGuest: true, loading: false })
  },

  exitGuest: () => {
    try {
      localStorage.removeItem(GUEST_KEY)
    } catch {
      // Ignore storage failures.
    }
    set({ isGuest: false, loading: supabaseConfigured })
    if (supabaseConfigured) void ensureAuthInitialized()
  },

  signOut: async () => {
    const supabase = await getSupabaseClient()
    await supabase?.auth.signOut()
    try {
      localStorage.removeItem(GUEST_KEY)
    } catch {
      // Ignore storage failures.
    }
    set({ session: null, isGuest: false })
  },
}))

let authInitialization: Promise<void> | null = null
let authInitialized = false

export function ensureAuthInitialized(): Promise<void> {
  if (!supabaseConfigured) {
    useAuthStore.setState({ loading: false })
    return Promise.resolve()
  }
  if (authInitialized) return Promise.resolve()
  if (authInitialization) return authInitialization

  useAuthStore.setState({ loading: true })
  const initialization = getSupabaseClient()
    .then(async (supabase) => {
      if (!supabase) {
        useAuthStore.setState({ loading: false })
        return
      }
      const { data } = await supabase.auth.getSession()
      useAuthStore.setState({ session: data.session, loading: false })
      supabase.auth.onAuthStateChange((_event, session) => {
        useAuthStore.setState({ session, loading: false })
      })
      authInitialized = true
    })
    .catch(() => {
      useAuthStore.setState({ loading: false })
    })
  authInitialization = initialization
  void initialization.then(() => {
    if (authInitialization === initialization) authInitialization = null
  })
  return initialization
}

if (supabaseConfigured && !initialGuest) void ensureAuthInitialized()
