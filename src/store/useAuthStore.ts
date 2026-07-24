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
  updateProfile: (profile: { displayName: string; profileColor: string }) => Promise<void>
  signOut: () => Promise<void>
}

const FALLBACK_PROFILE_COLORS = ['#34d399', '#60a5fa', '#a78bfa', '#fb7185', '#fbbf24', '#22d3ee'] as const

export const PROFILE_COLORS = [
  ...FALLBACK_PROFILE_COLORS,
  '#2dd4bf',
  '#a3e635',
  '#fb923c',
  '#f87171',
  '#e879f9',
  '#818cf8',
] as const

function fallbackProfileColor(userId: string): string {
  let hash = 0
  for (const character of userId) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
  return FALLBACK_PROFILE_COLORS[Math.abs(hash) % FALLBACK_PROFILE_COLORS.length]!
}

export function accountDisplayName(session: Session | null): string {
  if (!session) return 'Guest'
  const metadata = session.user.user_metadata
  const named = metadata.full_name ?? metadata.name ?? metadata.user_name
  if (typeof named === 'string' && named.trim()) return named.trim().slice(0, 60)
  return session.user.email?.split('@')[0]?.slice(0, 60) || 'Grovepad user'
}

export function accountProfileColor(session: Session | null): string {
  if (!session) return PROFILE_COLORS[0]
  const color = session.user.user_metadata.profile_color
  return typeof color === 'string' && (PROFILE_COLORS as readonly string[]).includes(color)
    ? color
    : fallbackProfileColor(session.user.id)
}

const initialGuest = loadGuestChoice()

export const useAuthStore = create<AuthState>()((set, get) => ({
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

  updateProfile: async ({ displayName, profileColor }) => {
    const name = displayName.trim().slice(0, 60)
    if (!name) throw new Error('Enter a display name')
    if (!(PROFILE_COLORS as readonly string[]).includes(profileColor)) throw new Error('Choose a profile color')
    const client = await getSupabaseClient()
    if (!client) throw new Error('Sign in to update your profile')
    const { data, error } = await client.auth.updateUser({
      data: { full_name: name, profile_color: profileColor },
    })
    if (error) throw error
    const current = get().session
    if (current && data.user) set({ session: { ...current, user: data.user } })
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
  // Re-entering login after a completed guest/session check must not leave
  // the boot screen waiting on work that has already finished.
  if (authInitialized) {
    useAuthStore.setState({ loading: false })
    return Promise.resolve()
  }
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
