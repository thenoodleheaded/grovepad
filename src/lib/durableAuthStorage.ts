// ---------------------------------------------------------------------------
// Where the signed-in session actually lives.
//
// By default the cloud SDK keeps the session in one localStorage entry whose
// name is derived from the project reference. That makes staying signed in
// depend on two fragile things: that localStorage survives (it is the first
// thing an app update, a storage-pressure eviction, or a webview data reset
// takes), and that the project reference never changes.
//
// This adapter fixes both. The key is ours and never moves, and every write is
// mirrored into IndexedDB, which is durable storage the browser does not
// evict casually. A boot that finds localStorage empty restores from the
// mirror instead of showing the login page. Signing out clears both.
// ---------------------------------------------------------------------------

/** Ours, not the SDK's — a changed project reference must not sign anyone out. */
export const AUTH_STORAGE_KEY = 'grovepad:auth:v1'

const DB_NAME = 'grovepad-auth'
const DB_VERSION = 1
const SESSION_STORE = 'session'
/** The SDK's own naming, adopted once so existing sign-ins carry over. */
const LEGACY_KEY_PATTERN = /^sb-.+-auth-token$/

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode or a full quota. The IndexedDB mirror still carries it.
  }
}

function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing to do; the mirror removal below is the one that matters.
  }
}

/** The SDK's own entry from before this adapter existed, if one is still there. */
function adoptLegacySession(): string | null {
  try {
    const legacyKey = Object.keys(localStorage).find((key) => LEGACY_KEY_PATTERN.test(key))
    if (!legacyKey) return null
    const value = localStorage.getItem(legacyKey)
    // Removed on adoption: left behind, a later sign-out would clear our key
    // and this one would silently sign the account back in on the next boot.
    localStorage.removeItem(legacyKey)
    return value
  } catch {
    return null
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Session store unavailable'))
      return
    }
    request.onerror = () => reject(request.error ?? new Error('Unable to open the session store'))
    request.onblocked = () => reject(new Error('Session store upgrade is blocked'))
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        database.createObjectStore(SESSION_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function readMirror(key: string): Promise<string | null> {
  try {
    const database = await openDatabase()
    try {
      const value = await new Promise<unknown>((resolve, reject) => {
        const request = database.transaction(SESSION_STORE).objectStore(SESSION_STORE).get(key)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Session read failed'))
      })
      return typeof value === 'string' ? value : null
    } finally {
      database.close()
    }
  } catch {
    return null
  }
}

async function writeMirror(key: string, value: string | null): Promise<void> {
  try {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(SESSION_STORE, 'readwrite')
      const store = transaction.objectStore(SESSION_STORE)
      if (value === null) store.delete(key)
      else store.put(value, key)
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error('Session write failed'))
        transaction.onabort = () => reject(transaction.error ?? new Error('Session write aborted'))
      })
    } finally {
      database.close()
    }
  } catch {
    // localStorage already holds the live copy; the mirror is the backup.
  }
}

/** The `auth.storage` adapter handed to the cloud client. */
export const durableAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const local = readLocal(key)
    if (local !== null) return local
    const mirrored = await readMirror(key)
    if (mirrored !== null) {
      // Put it back where the SDK's synchronous paths expect to find it.
      writeLocal(key, mirrored)
      return mirrored
    }
    // Only the session slot may consume the legacy entry. The SDK reads
    // `<key>-code-verifier` before it ever reads the session, and adoption is
    // one-shot and destructive: answering that read from the legacy entry would
    // delete it and file the session JSON under a key nothing looks at, signing
    // the whole legacy cohort out on their first boot with this adapter.
    if (key !== AUTH_STORAGE_KEY) return null
    const legacy = adoptLegacySession()
    if (legacy === null) return null
    writeLocal(key, legacy)
    void writeMirror(key, legacy)
    return legacy
  },

  setItem(key: string, value: string): void {
    writeLocal(key, value)
    void writeMirror(key, value)
  },

  removeItem(key: string): void {
    removeLocal(key)
    void writeMirror(key, null)
  },
}
