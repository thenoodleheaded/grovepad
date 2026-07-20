import * as Y from 'yjs'
import type { CollaborationRole } from './types'

const DATABASE_NAME = 'grovepad-collaboration'
const DATABASE_VERSION = 2
const STORE_NAME = 'pending-updates'
const DOCUMENT_STORE_NAME = 'documents'
const CANVAS_INDEX = 'canvas-id'
const MERGE_THRESHOLD = 100

export interface PendingCollaborationUpdate {
  id: string
  canvasId: string
  payload: Uint8Array
  createdAt: number
}

export interface CachedCollaborationDocument {
  canvasId: string
  snapshot: Uint8Array
  lastSequence: number
  role: CollaborationRole
  updatedAt: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Unable to open collaboration queue'))
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex(CANVAS_INDEX, 'canvasId')
      }
      if (!database.objectStoreNames.contains(DOCUMENT_STORE_NAME)) {
        database.createObjectStore(DOCUMENT_STORE_NAME, { keyPath: 'canvasId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Collaboration queue request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Collaboration queue transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Collaboration queue transaction aborted'))
  })
}

function newId(): string {
  return crypto.randomUUID()
}

export async function listPendingUpdates(canvasId: string): Promise<PendingCollaborationUpdate[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME)
    const index = transaction.objectStore(STORE_NAME).index(CANVAS_INDEX)
    const values = await requestResult(index.getAll(canvasId) as IDBRequest<PendingCollaborationUpdate[]>)
    return values.sort((left, right) => left.createdAt - right.createdAt)
  } finally {
    database.close()
  }
}

export async function enqueuePendingUpdate(
  canvasId: string,
  payload: Uint8Array,
  id = newId(),
): Promise<PendingCollaborationUpdate> {
  const pending: PendingCollaborationUpdate = {
    id, canvasId, payload: payload.slice(), createdAt: Date.now(),
  }
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(pending)
    await transactionDone(transaction)
  } finally {
    database.close()
  }

  const all = await listPendingUpdates(canvasId)
  if (all.length <= MERGE_THRESHOLD) return pending
  const merged: PendingCollaborationUpdate = {
    id: newId(),
    canvasId,
    payload: Y.mergeUpdates(all.map((entry) => entry.payload)),
    createdAt: all[0]!.createdAt,
  }
  const compactDatabase = await openDatabase()
  try {
    const transaction = compactDatabase.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    for (const entry of all) store.delete(entry.id)
    store.put(merged)
    await transactionDone(transaction)
  } finally {
    compactDatabase.close()
  }
  return merged
}

export async function removePendingUpdates(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    for (const id of ids) store.delete(id)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function readCachedCollaborationDocument(
  canvasId: string,
): Promise<CachedCollaborationDocument | null> {
  const database = await openDatabase()
  try {
    return (await requestResult(
      database.transaction(DOCUMENT_STORE_NAME).objectStore(DOCUMENT_STORE_NAME).get(canvasId) as
        IDBRequest<CachedCollaborationDocument | undefined>,
    )) ?? null
  } finally {
    database.close()
  }
}

export async function writeCachedCollaborationDocument(
  document: CachedCollaborationDocument,
): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(DOCUMENT_STORE_NAME, 'readwrite')
    transaction.objectStore(DOCUMENT_STORE_NAME).put({
      ...document,
      snapshot: document.snapshot.slice(),
    })
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}
