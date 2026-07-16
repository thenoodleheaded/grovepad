import type { PersistedBoard } from '../types/persistence'

const DB_NAME = 'grovepad'
const DB_VERSION = 2
const BOARD_STORE = 'board'
const SNAPSHOT_STORE = 'snapshots'
const MEDIA_STORE = 'media'
const CURRENT_KEY = 'current'

export interface LocalSnapshot {
  id: string
  createdAt: number
  kind?: 'board'
  board: PersistedBoard
}

export interface MigrationSourceSnapshot {
  id: string
  createdAt: number
  kind: 'migration-source'
  sourceVersion: number
  targetVersion: number
  payload: unknown
}

type StoredSnapshot = LocalSnapshot | MigrationSourceSnapshot

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Unable to open board database'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(BOARD_STORE)) db.createObjectStore(BOARD_STORE)
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE)
    }
    request.onsuccess = () => resolve(request.result)
  })
}

export async function writeMediaBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(MEDIA_STORE, 'readwrite')
    tx.objectStore(MEDIA_STORE).put(blob, key)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Media write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('Media write aborted'))
    })
  } finally { db.close() }
}

export async function readMediaBlob(key: string): Promise<Blob | null> {
  const db = await openDatabase()
  try {
    return (await requestResult(db.transaction(MEDIA_STORE).objectStore(MEDIA_STORE).get(key))) ?? null
  } finally { db.close() }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Board database request failed'))
  })
}

export async function readBoardDatabase(): Promise<PersistedBoard | null> {
  const db = await openDatabase()
  try {
    return (await requestResult(db.transaction(BOARD_STORE).objectStore(BOARD_STORE).get(CURRENT_KEY))) ?? null
  } finally {
    db.close()
  }
}

export async function writeBoardDatabase(board: PersistedBoard): Promise<void> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(BOARD_STORE, 'readwrite')
    tx.objectStore(BOARD_STORE).put(board, CURRENT_KEY)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Board database write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('Board database write aborted'))
    })
  } finally {
    db.close()
  }
}

export async function saveRollingSnapshot(board: PersistedBoard): Promise<void> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite')
    const store = tx.objectStore(SNAPSHOT_STORE)
    const createdAt = Date.now()
    store.put({ id: String(createdAt), createdAt, kind: 'board', board } satisfies LocalSnapshot)
    const all = await requestResult(store.getAll() as IDBRequest<StoredSnapshot[]>)
    all.sort((a, b) => b.createdAt - a.createdAt)
    for (const stale of all.slice(20)) store.delete(stale.id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Snapshot write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('Snapshot write aborted'))
    })
  } finally {
    db.close()
  }
}

function stablePayloadHash(payload: unknown): string {
  const text = JSON.stringify(payload) ?? 'undefined'
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/** Atomically preserve a migration source and commit its upgraded board. */
export async function writeMigratedBoardDatabase(
  payload: unknown,
  sourceVersion: number,
  board: PersistedBoard,
): Promise<void> {
  const db = await openDatabase()
  try {
    const tx = db.transaction([SNAPSHOT_STORE, BOARD_STORE], 'readwrite')
    const createdAt = Date.now()
    const snapshot: MigrationSourceSnapshot = {
      id: `migration-v${sourceVersion}-v${board.v}-${stablePayloadHash(payload)}`,
      createdAt,
      kind: 'migration-source',
      sourceVersion,
      targetVersion: board.v,
      payload,
    }
    tx.objectStore(SNAPSHOT_STORE).put(snapshot)
    tx.objectStore(BOARD_STORE).put(board, CURRENT_KEY)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Migrated board write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('Migrated board write aborted'))
    })
  } finally {
    db.close()
  }
}

export async function listRollingSnapshots(): Promise<LocalSnapshot[]> {
  const db = await openDatabase()
  try {
    const all = await requestResult(db.transaction(SNAPSHOT_STORE).objectStore(SNAPSHOT_STORE).getAll() as IDBRequest<StoredSnapshot[]>)
    return all
      .filter((snapshot): snapshot is LocalSnapshot => snapshot.kind !== 'migration-source' && 'board' in snapshot)
      .sort((a, b) => b.createdAt - a.createdAt)
  } finally {
    db.close()
  }
}
