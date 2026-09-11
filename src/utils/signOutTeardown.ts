// ---------------------------------------------------------------------------
// What leaving actually has to remove.
//
// Signing out used to clear the Supabase session and the guest flag, and stop.
// Everything else stayed: the whole board in IndexedDB, its media blobs, the
// collaboration CRDT cache, the cached subscription, and long-lived Google and
// Microsoft calendar tokens in localStorage. On a shared or borrowed machine the
// next person to open Grovepad saw the previous person's boards — and, because
// the board key is global rather than per-account, signing in could push them
// into their own cloud.
//
// The rule this file encodes: nothing that belonged to the account that just
// left may survive on the device. Settings and theme are deliberately kept —
// they are preferences of the machine, not contents of the account.
// ---------------------------------------------------------------------------

/** Keys holding account content or credentials. Preferences are not listed. */
const ACCOUNT_LOCAL_STORAGE_KEYS = [
  'grovepad:board:v1',
  'grovepad:board:v2',
  'grovepad:device:v1',
  'grovepad:guest:v1',
  'grovepad:view:v1',
  'grovepad:auth:v1',
  'grovepad:minimap',
  'grovepad:calendar:google-token:v1',
  'grovepad:calendar:microsoft-token:v1',
]

/** The cached subscription is written per account, so it is matched by prefix. */
const ACCOUNT_LOCAL_STORAGE_PREFIXES = ['grovepad:subscription:v1:', 'grovepad:cloud-sync:last:']

const ACCOUNT_DATABASES = [
  'grovepad',
  'grovepad-collaboration',
  // The mirrored session and the last-synced board are both account content.
  'grovepad-auth',
  'grovepad-sync',
]

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.deleteDatabase(name)
    } catch {
      resolve()
      return
    }
    // `blocked` fires when another tab still holds the database open. Resolving
    // there is deliberate: a sign-out must never hang waiting on another tab,
    // and the delete completes once that tab lets go.
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

/**
 * Remove every trace of the account that is leaving. Best-effort by
 * construction — a storage backend that refuses must not strand somebody in a
 * half-signed-out state, so each step swallows its own failure.
 */
export async function clearLocalAccountData(): Promise<void> {
  try {
    for (const key of ACCOUNT_LOCAL_STORAGE_KEYS) localStorage.removeItem(key)
    for (const key of Object.keys(localStorage)) {
      if (ACCOUNT_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // Storage disabled or full; there is nothing better to do here.
  }

  try {
    sessionStorage.clear()
  } catch {
    // Same.
  }

  await Promise.all(ACCOUNT_DATABASES.map(deleteDatabase)).catch(() => undefined)
}
