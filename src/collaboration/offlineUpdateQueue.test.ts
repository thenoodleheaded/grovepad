import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  enqueuePendingUpdate,
  listPendingUpdates,
  readCachedCollaborationDocument,
  removePendingUpdates,
  writeCachedCollaborationDocument,
} from './offlineUpdateQueue'

function deleteQueueDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('grovepad-collaboration')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Collaboration queue database is blocked'))
  })
}

function updateFor(index: number): Uint8Array {
  const doc = new Y.Doc()
  doc.getMap('values').set(String(index), index)
  return Y.encodeStateAsUpdate(doc)
}

describe('offline collaboration update queue', () => {
  beforeEach(deleteQueueDatabase)

  it('isolates canvases and removes only acknowledged update ids', async () => {
    const first = await enqueuePendingUpdate('a', updateFor(1), 'first')
    await enqueuePendingUpdate('a', updateFor(2), 'second')
    await enqueuePendingUpdate('b', updateFor(3), 'third')

    expect((await listPendingUpdates('a')).map((entry) => entry.id)).toEqual(['first', 'second'])
    await removePendingUpdates([first.id])
    expect((await listPendingUpdates('a')).map((entry) => entry.id)).toEqual(['second'])
    expect((await listPendingUpdates('b')).map((entry) => entry.id)).toEqual(['third'])
  })

  it('compacts an offline burst into one idempotent Yjs update', async () => {
    for (let index = 0; index < 101; index += 1) {
      await enqueuePendingUpdate('pressure', updateFor(index), `update-${index}`)
    }
    const pending = await listPendingUpdates('pressure')
    expect(pending).toHaveLength(1)

    const recovered = new Y.Doc()
    Y.applyUpdate(recovered, pending[0]!.payload)
    Y.applyUpdate(recovered, pending[0]!.payload)
    expect(recovered.getMap('values').size).toBe(101)
  })

  it('preserves the CRDT history and role needed for an offline cold start', async () => {
    const source = new Y.Doc()
    source.getText('note').insert(0, 'history-preserving text')
    await writeCachedCollaborationDocument({
      canvasId: 'cached',
      snapshot: Y.encodeStateAsUpdate(source),
      lastSequence: 42,
      role: 'commenter',
      updatedAt: 123,
    })

    const cached = await readCachedCollaborationDocument('cached')
    expect(cached).toMatchObject({ canvasId: 'cached', lastSequence: 42, role: 'commenter', updatedAt: 123 })
    const recovered = new Y.Doc()
    Y.applyUpdate(recovered, cached!.snapshot)
    expect(recovered.getText('note').toString()).toBe('history-preserving text')
  })
})
