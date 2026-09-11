import type { PersistedBoard } from '../types/persistence'
import { canonicalJson, sha256Hex, splitCloudBoard } from './cloudDocuments'

// ---------------------------------------------------------------------------
// The last-synced copy: what makes a silent reconcile possible.
//
// After every successful sync this records, per account, the exact board both
// sides agreed on. The next reconcile compares this device and the cloud to
// THAT copy instead of to each other, which is the difference between knowing
// who edited what and having to ask the user.
//
// It lives in its own IndexedDB database rather than localStorage for two
// reasons: a full board does not fit comfortably in localStorage, and a wiped
// localStorage (which is what leaves people signed out after an app update)
// must not also destroy the lineage and drag the conflict prompt back.
// ---------------------------------------------------------------------------

const DB_NAME = 'grovepad-sync'
const DB_VERSION = 1
const BASELINE_STORE = 'baselines'

export interface BoardFingerprint {
  /** Matches `board_indexes.checksum` for the same board, byte for byte. */
  indexChecksum: string
  /** canvasId -> the checksum `canvas_docs.checksum` holds for that canvas. */
  canvasChecksums: Record<string, string>
}

export interface SyncBaseline extends BoardFingerprint {
  userId: string
  /** The agreed board itself — the base side of the three-way merge. */
  board: PersistedBoard
  cloudUpdatedAt: string | null
  at: number
}

/**
 * Hash a board the way the cloud hashes it. Local and remote fingerprints are
 * therefore directly comparable, so a reconcile can decide whether anything
 * moved from two tiny metadata reads and no board transfer at all.
 */
export async function fingerprintBoard(board: PersistedBoard): Promise<BoardFingerprint> {
  const split = splitCloudBoard(board)
  const entries = await Promise.all(
    Object.entries(split.canvases).map(async ([canvasId, document]) =>
      [canvasId, await sha256Hex(canonicalJson(document))] as const),
  )
  return {
    indexChecksum: await sha256Hex(canonicalJson(split.index)),
    canvasChecksums: Object.fromEntries(entries),
  }
}

export function fingerprintsMatch(left: BoardFingerprint, right: BoardFingerprint): boolean {
  if (left.indexChecksum !== right.indexChecksum) return false
  const leftIds = Object.keys(left.canvasChecksums)
  if (leftIds.length !== Object.keys(right.canvasChecksums).length) return false
  return leftIds.every((id) => left.canvasChecksums[id] === right.canvasChecksums[id])
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Sync baseline database unavailable'))
      return
    }
    request.onerror = () => reject(request.error ?? new Error('Unable to open the sync baseline database'))
    // Another tab holding an older version open would otherwise hang this
    // promise forever, and every reconcile behind it.
    request.onblocked = () => reject(new Error('Sync baseline database upgrade is blocked'))
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(BASELINE_STORE)) {
        database.createObjectStore(BASELINE_STORE, { keyPath: 'userId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Sync baseline request failed'))
  })
}

function isBaseline(value: unknown): value is SyncBaseline {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.userId === 'string' &&
    typeof record.indexChecksum === 'string' &&
    typeof record.canvasChecksums === 'object' && record.canvasChecksums !== null &&
    typeof record.board === 'object' && record.board !== null
}

/**
 * The baseline for one account, or null when there is none to reconcile
 * against. A storage failure reads as "no lineage" rather than throwing: the
 * merge then unions both sides, which is lossless, instead of blocking sync.
 */
export async function readSyncBaseline(userId: string): Promise<SyncBaseline | null> {
  try {
    const database = await openDatabase()
    try {
      const stored = await requestResult(
        database.transaction(BASELINE_STORE).objectStore(BASELINE_STORE).get(userId),
      )
      return isBaseline(stored) && stored.userId === userId ? stored : null
    } finally {
      database.close()
    }
  } catch {
    return null
  }
}

/** Record the agreed board. Best-effort: a failure only costs the next merge
 * its lineage, so it must never fail a sync that already succeeded. */
export async function writeSyncBaseline(baseline: SyncBaseline): Promise<void> {
  try {
    const database = await openDatabase()
    try {
      const transaction = database.transaction(BASELINE_STORE, 'readwrite')
      transaction.objectStore(BASELINE_STORE).put(baseline)
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error('Baseline write failed'))
        transaction.onabort = () => reject(transaction.error ?? new Error('Baseline write aborted'))
      })
    } finally {
      database.close()
    }
  } catch {
    // Nothing to recover: the next reconcile simply merges without lineage.
  }
}
