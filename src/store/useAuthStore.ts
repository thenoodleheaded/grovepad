import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient, supabaseConfigured } from '../lib/supabase'
import { rememberExternalCalendarToken } from '../services/externalCalendarService'

// ---------------------------------------------------------------------------
// Auth session state. The login page gates the app until either a Supabase
// session exists or the user chooses guest mode (local-first, per the Grove
// philosophy). The guest choice persists so returning users go straight in.
// ---------------------------------------------------------------------------

const GUEST_KEY = 'grovepad:guest:v1'
const LAST_ACCOUNT_KEY = 'grovepad:auth:last-account:v1'

function loadGuestChoice(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * The account that was signed in last time, kept so a boot that cannot reach
 * the auth server does not look like a sign-out. Written on every successful
 * session and erased only when somebody actually signs out.
 */
export interface RememberedAccount {
  id: string
  name: string
  color: string
}

function loadRememberedAccount(): RememberedAccount | null {
  try {
    const raw = localStorage.getItem(LAST_ACCOUNT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    return typeof record.id === 'string' && typeof record.name === 'string' && typeof record.color === 'string'
      ? { id: record.id, name: record.name, color: record.color }
      : null
  } catch {
    return null
  }
}

function rememberAccount(account: RememberedAccount | null): void {
  try {
    if (account) localStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(account))
    else localStorage.removeItem(LAST_ACCOUNT_KEY)
  } catch {
    // Storage unavailable — the app still works, it just cannot ride out an
    // offline boot without showing the login page.
  }
}

export interface AuthState {
  session: Session | null
  /** True until the initial getSession() resolves — prevents a login flash. */
  loading: boolean
  isGuest: boolean
  /** Who was signed in last, so an unreachable auth server is not a sign-out. */
  rememberedAccount: RememberedAccount | null

  continueAsGuest: () => void
  /** Leave guest mode and show the login page again. */
  exitGuest: () => void
  updateProfile: (profile: { displayName: string; profileColor: string }) => Promise<void>
  signOut: () => Promise<void>
  /**
   * Erase the account itself, not just this session. Required by Apple
   * guideline 5.1.1(v) and Play's data-deletion policy for any app that can
   * create an account. Irreversible.
   */
  deleteAccount: () => Promise<void>
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

/** Keep the remembered account in step with whatever session just arrived. A
 * null session is NOT a reason to forget: only signOut() does that. */
function recordAccount(session: Session | null): void {
  if (!session) return
  const account: RememberedAccount = {
    id: session.user.id,
    name: accountDisplayName(session),
    color: accountProfileColor(session),
  }
  const current = useAuthStore.getState().rememberedAccount
  if (current && current.id === account.id && current.name === account.name && current.color === account.color) {
    return
  }
  rememberAccount(account)
  useAuthStore.setState({ rememberedAccount: account })
}

const initialGuest = loadGuestChoice()

export const useAuthStore = create<AuthState>()((set, get) => ({
  session: null,
  loading: supabaseConfigured && !initialGuest,
  isGuest: initialGuest,
  rememberedAccount: loadRememberedAccount(),

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
    // The board, its media, the collaboration cache and the calendar tokens all
    // belong to the account that is leaving. Clearing only the session left them
    // on the device for whoever signed in next — and because the board key is
    // not per-account, that person could then sync somebody else's boards into
    // their own cloud.
    const { clearLocalAccountData } = await import('../utils/signOutTeardown')
    await clearLocalAccountData()
    // An explicit sign-out is the ONE thing that forgets the account. Every
    // other path back to the login page must be able to recognize the person.
    rememberAccount(null)
    set({ session: null, isGuest: false, rememberedAccount: null })
    // Nothing held in memory is trustworthy once the stores it mirrors are gone,
    // so the app reboots clean rather than being patched back to empty.
    globalThis.location?.reload()
  },

  deleteAccount: async () => {
    const supabase = await getSupabaseClient()
    if (!supabase) throw new Error('Account deletion needs a connection to Grovepad')

    // The server does the deleting. delete_own_account() takes no argument and
    // reads auth.uid(), so a caller cannot name somebody else's account. It
    // removes the auth.users row, every table that cascades from it, and the
    // caller's board-media objects, which are keyed by path and cascade from
    // nothing.
    const { error } = await supabase.rpc('delete_own_account')
    if (error) throw new Error(error.message || 'Could not delete your account')

    // Order matters. Only once the server has confirmed the account is gone is
    // it safe to destroy the local copy; doing it first would lose the boards
    // of somebody whose deletion then failed.
    await supabase.auth.signOut().catch(() => undefined)
    const { clearLocalAccountData } = await import('../utils/signOutTeardown')
    await clearLocalAccountData()
    rememberAccount(null)
    set({ session: null, isGuest: false, rememberedAccount: null })
    globalThis.location?.reload()
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
      rememberExternalCalendarToken(data.session)
      useAuthStore.setState({ session: data.session, loading: false })
      recordAccount(data.session)
      supabase.auth.onAuthStateChange((_event, session) => {
        rememberExternalCalendarToken(session)
        useAuthStore.setState({ session, loading: false })
        recordAccount(session)
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
