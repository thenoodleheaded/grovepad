import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { Widget } from '../types/spatial'
import { readCanvasSnapshot, writeCanvasSnapshot } from './yjsCanvas'

const canvasId = 'pressure-canvas'

function note(id: string, text: string): Widget {
  return {
    id, canvasId, type: 'notes', title: id,
    position: { x: 0, y: 0 }, size: { width: 320, height: 240 },
    data: { text }, metadata: { badges: [] },
  }
}

function rotated<T>(values: T[], offset: number): T[] {
  return [...values.slice(offset), ...values.slice(0, offset)]
}

describe('collaboration pressure', () => {
  it('converges 10 clients after out-of-order, duplicated, offline bursts', () => {
    const startedAt = performance.now()
    const seed = new Y.Doc()
    writeCanvasSnapshot(seed, {
      canvasId, canvas: { id: canvasId, name: 'Pressure' }, widgets: { shared: note('shared', '') }, relations: {}, connections: {}, groups: {},
    })
    const seedUpdate = Y.encodeStateAsUpdate(seed)
    const clients = Array.from({ length: 10 }, () => {
      const doc = new Y.Doc()
      Y.applyUpdate(doc, seedUpdate)
      return doc
    })
    const updateBursts: Uint8Array[][] = []

    for (let clientIndex = 0; clientIndex < clients.length; clientIndex += 1) {
      const doc = clients[clientIndex]!
      const updates: Uint8Array[] = []
      doc.on('update', (update) => updates.push(update))
      const id = `client-${clientIndex}`
      const snapshot = readCanvasSnapshot(doc, canvasId)
      snapshot.widgets[id] = note(id, `created by ${clientIndex}`)
      writeCanvasSnapshot(doc, snapshot)
      const entity = doc.getMap<Y.Map<unknown>>('widgets').get(id)!
      const sharedText = doc.getMap<Y.Text>('texts').get('shared')!
      for (let operation = 0; operation < 100; operation += 1) {
        doc.transact(() => {
          entity.set('position', { x: operation * 20, y: clientIndex * 20 })
          sharedText.insert(sharedText.length, `${clientIndex.toString(36)}.`)
        })
      }
      updateBursts.push(updates)
    }

    const allUpdates = updateBursts.flat()
    for (let clientIndex = 0; clientIndex < clients.length; clientIndex += 1) {
      const delivery = clientIndex % 2 === 0
        ? rotated(allUpdates, (clientIndex * 37) % allUpdates.length)
        : rotated(allUpdates, (clientIndex * 53) % allUpdates.length).reverse()
      for (const update of delivery) Y.applyUpdate(clients[clientIndex]!, update)
      // Simulate at-least-once replay after reconnect.
      for (const update of delivery.slice(0, 100)) Y.applyUpdate(clients[clientIndex]!, update)
    }

    const canonical = Y.encodeStateAsUpdate(clients[0]!)
    const firstSnapshot = readCanvasSnapshot(clients[0]!, canvasId)
    expect(Object.keys(firstSnapshot.widgets)).toHaveLength(11)
    expect((firstSnapshot.widgets.shared!.data as { text: string }).text).toHaveLength(2_000)
    for (const client of clients.slice(1)) {
      expect(Y.encodeStateAsUpdate(client)).toEqual(canonical)
      expect(readCanvasSnapshot(client, canvasId)).toEqual(firstSnapshot)
    }
    expect(performance.now() - startedAt).toBeLessThan(10_000)
  }, 15_000)

  it('reconstructs the same state from a compact snapshot plus a later tail', () => {
    const source = new Y.Doc()
    writeCanvasSnapshot(source, {
      canvasId, canvas: { id: canvasId, name: 'Pressure' }, widgets: { shared: note('shared', 'snapshot') }, relations: {}, connections: {}, groups: {},
    })
    const compactSnapshot = Y.encodeStateAsUpdate(source)
    const tail: Uint8Array[] = []
    source.on('update', (update) => tail.push(update))
    source.getMap<Y.Text>('texts').get('shared')!.insert(8, ' + durable tail')

    const coldStart = new Y.Doc()
    Y.applyUpdate(coldStart, compactSnapshot)
    for (const update of tail) Y.applyUpdate(coldStart, update)
    expect(Y.encodeStateAsUpdate(coldStart)).toEqual(Y.encodeStateAsUpdate(source))
    expect((readCanvasSnapshot(coldStart, canvasId).widgets.shared!.data as { text: string }).text)
      .toBe('snapshot + durable tail')
  })
})
