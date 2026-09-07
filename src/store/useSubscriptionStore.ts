import { create } from 'zustand'
import { getSupabaseClient } from '../lib/supabase'
import {
  FREE_ENTITLEMENTS,
  deriveEntitlements,
  parseSubscriptionRow,
  type Entitlements,
  type SubscriptionRecord,
} from '../subscription/entitlements'

// ---------------------------------------------------------------------------
// The client's view of the subscription row.
//
// Two rules shape everything here:
//
//   1. This store never decides what an entitlement means. It holds the record
//      and asks src/subscription/entitlements.ts. One owner, no second opinion.
//
//   2. Losing the network must never cost somebody their sync. The last known
//      record is cached per account and used on boot, so a plane, a tunnel or a
//      Supabase outage leaves a paying customer working exactly as before. The
//      grace window inside deriveEntitlements is what eventually ends it.
//
// The cache is a convenience, not an authority. Every real gate is enforced by
// the database in Phase 3; a forged cache entry buys a nicer-looking button and
// nothing else.
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'grovepad:subscription:v1:'

export type SubscriptionLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface CachedEntry {
  userId: string
  record: SubscriptionRecord | null
  fetchedAt: number
}

function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`
}

/** Cached records are stored in record shape; the parser wants row shape. */
function toRow(record: unknown): unknown {
  if (typeof record !== 'object' || record === null) return null
  const value = record as Partial<SubscriptionRecord>
  return {
    plan: value.plan,
    status: value.status,
    billing_interval: value.billingInterval,
    current_period_end: value.currentPeriodEnd,
    trial_ends_at: value.trialEndsAt,
    cancel_at_period_end: value.cancelAtPeriodEnd,
    cloud_retention_until: value.cloudRetentionUntil,
  }
}

function readCache(userId: string): CachedEntry | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const entry = parsed as Partial<CachedEntry>
    // A cache written for another account must never be read as this one's.
    if (entry.userId !== userId) return null
    if (typeof entry.fetchedAt !== 'number') return null
    // Re-validate through the same parser the network path uses, so a hand-
    // edited cache cannot introduce a shape the rest of the app never expects.
    const record = entry.record ? parseSubscriptionRow(toRow(entry.record)) : null
    return { userId, record, fetchedAt: entry.fetchedAt }
  } catch {
    return null
  }
}

function writeCache(entry: CachedEntry): void {
  try {
    localStorage.setItem(cacheKey(entry.userId), JSON.stringify(entry))
  } catch {
    // Storage full or blocked. The store still works for this session.
  }
}

function clearCache(userId: string): void {
  try {
    localStorage.removeItem(cacheKey(userId))
  } catch {
    // Ignore storage failures.
  }
}

export interface SubscriptionState {
  /** The account this state belongs to. Null when signed out or in guest mode. */
  userId: string | null
  record: SubscriptionRecord | null
  /** Derived, never hand-set. Free until proven otherwise. */
  entitlements: Entitlements
  status: SubscriptionLoadStatus
  /** Epoch ms of the last successful read, from cache or network. */
  lastSyncedAt: number | null
  /** True when the current entitlement came from cache rather than the server. */
  fromCache: boolean
  error: string | null

  /** Adopt an account: seed from cache immediately, then refresh. */
  adoptAccount: (userId: string) => Promise<void>
  /** Re-read the row from the server. */
  refresh: () => Promise<void>
  /** Recompute against the current clock — a grace window can close mid-session. */
  revalidate: () => void
  /** Sign-out or guest mode. Forgets the account and drops to free. */
  reset: () => void
}

const INITIAL = {
  userId: null,
  record: null,
  entitlements: FREE_ENTITLEMENTS,
  status: 'idle',
  lastSyncedAt: null,
  fromCache: false,
  error: null,
} satisfies Omit<SubscriptionState, 'adoptAccount' | 'refresh' | 'revalidate' | 'reset'>

export const useSubscriptionStore = create<SubscriptionState>()((set, get) => ({
  ...INITIAL,

  adoptAccount: async (userId: string) => {
    const cached = readCache(userId)
    set({
      userId,
      record: cached?.record ?? null,
      entitlements: deriveEntitlements(cached?.record ?? null, Date.now()),
      status: 'loading',
      lastSyncedAt: cached?.fetchedAt ?? null,
      fromCache: cached !== null,
      error: null,
    })
    await get().refresh()
  },

  refresh: async () => {
    const userId = get().userId
    if (!userId) return
    set({ status: 'loading' })
    try {
      const client = await getSupabaseClient()
      if (!client) {
        // Local-only build. There is no subscription to have, and no error to
        // report: the free plan is a complete product.
        set({ status: 'ready', record: null, entitlements: FREE_ENTITLEMENTS, error: null })
        return
      }
      const { data, error } = await client
        .from('subscriptions')
        .select(
          'plan, status, billing_interval, current_period_end, trial_ends_at, cancel_at_period_end, cloud_retention_until',
        )
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      // The account may have changed while the request was in flight.
      if (get().userId !== userId) return

      const record = data ? parseSubscriptionRow(data) : null
      const fetchedAt = Date.now()
      writeCache({ userId, record, fetchedAt })
      set({
        record,
        entitlements: deriveEntitlements(record, fetchedAt),
        status: 'ready',
        lastSyncedAt: fetchedAt,
        fromCache: false,
        error: null,
      })
    } catch (error: unknown) {
      if (get().userId !== userId) return
      // A failed read must not revoke anything. Whatever the cache seeded stays
      // in force until its own grace window closes — this is the flight case.
      set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  revalidate: () => {
    const { record, entitlements } = get()
    const next = deriveEntitlements(record, Date.now())
    // Zustand compares by reference; only publish a genuine change so a ticking
    // revalidation does not re-render every consumer once a minute.
    if (next.isSubscribed !== entitlements.isSubscribed || next.source !== entitlements.source) {
      set({ entitlements: next })
    }
  },

  reset: () => {
    const userId = get().userId
    if (userId) clearCache(userId)
    set({ ...INITIAL })
  },
}))
