import { useAuthStore } from '../store/useAuthStore'
import { useSubscriptionStore } from '../store/useSubscriptionStore'

// ---------------------------------------------------------------------------
// Keeps the subscription store pointed at whoever is signed in.
//
// Runtime-owned, so it starts once from appRuntime and hands back one
// idempotent disposer. Nothing here is started at component-module scope, and
// nothing here blocks the app: a subscription that never loads leaves the free
// plan in force, which is a complete product.
// ---------------------------------------------------------------------------

/** A grace window closing, or a trial ending, should not need a reload. */
const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000
/** Re-read the row when the tab comes back after this long away. */
const STALE_AFTER_MS = 10 * 60 * 1000

export function initSubscriptionRuntime(): () => void {
  const store = useSubscriptionStore
  let disposed = false

  const applySession = (userId: string | null): void => {
    if (disposed) return
    const current = store.getState().userId
    if (userId === current) return
    if (!userId) {
      // Signing out or entering guest mode drops to free and forgets the cache
      // for that account, so a shared device does not leak an entitlement.
      store.getState().reset()
      return
    }
    if (current) store.getState().reset()
    void store.getState().adoptAccount(userId)
  }

  applySession(useAuthStore.getState().session?.user.id ?? null)

  const unsubscribeAuth = useAuthStore.subscribe((state) => {
    applySession(state.session?.user.id ?? null)
  })

  const revalidateTimer = window.setInterval(() => {
    if (disposed) return
    store.getState().revalidate()
  }, REVALIDATE_INTERVAL_MS)

  const refreshIfStale = (): void => {
    if (disposed) return
    const { userId, lastSyncedAt } = store.getState()
    if (!userId) return
    if (lastSyncedAt !== null && Date.now() - lastSyncedAt < STALE_AFTER_MS) {
      store.getState().revalidate()
      return
    }
    void store.getState().refresh()
  }

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') refreshIfStale()
  }
  // Coming back online is the moment a cached-through-an-outage entitlement can
  // finally be confirmed or corrected.
  const onOnline = (): void => {
    if (!disposed && store.getState().userId) void store.getState().refresh()
  }

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onOnline)

  return () => {
    if (disposed) return
    disposed = true
    unsubscribeAuth()
    window.clearInterval(revalidateTimer)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
  }
}
