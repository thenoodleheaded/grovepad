import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { Widget } from '../types/spatial'
import {
  CollaborationPayloadError,
  LOCAL_STORE_ORIGIN,
  readCanvasSnapshot,
  REMOTE_TRANSPORT_ORIGIN,
  snapshotCanvas,
  writeCanvasSnapshot,
} from './yjsCanvas'

const canvasId = 'canvas-a'

function note(id: string, text: string, x = 0): Widget {
  return {
    id,
    type: 'notes',
    title: 'Shared note',
    canvasId,
    position: { x, y: 0 },
    size: { width: 320, height: 240 },
    data: { text },
    metadata: { badges: [] },
  }
}

function content(widget: Widget) {
  return {
    canvasId,
    canvas: { id: canvasId, name: 'Canvas A' },
    widgets: { [widget.id]: widget },
    relations: {},
    connections: {},
    glues: {},
  }
}

function exchange(left: Y.Doc, right: Y.Doc): void {
  Y.applyUpdate(right, Y.encodeStateAsUpdate(left), REMOTE_TRANSPORT_ORIGIN)
  Y.applyUpdate(left, Y.encodeStateAsUpdate(right), REMOTE_TRANSPORT_ORIGIN)
}

describe('Yjs canvas document', () => {
  it('round-trips canvas entities and keeps other canvases out', () => {
    const doc = new Y.Doc()
    const a = note('a', 'hello')
    const b = { ...note('b', 'other'), canvasId: 'canvas-b' }
    const snapshot = snapshotCanvas({
      widgets: { a, b },
      relations: {
        inside: { id: 'inside', fromId: 'a', toId: 'a', type: 'cousin', isResolved: false },
        outside: { id: 'outside', fromId: 'a', toId: 'b', type: 'parent', isResolved: false },
      },
      connections: {},
      glues: {},
      canvases: {
        [canvasId]: {
          id: canvasId,
          name: 'Canvas A',
          gridIntensity: 44,
          linksVisible: false,
          relationStrict: false,
        },
        'canvas-b': { id: 'canvas-b', name: 'Canvas B' },
      },
    }, canvasId)

    writeCanvasSnapshot(doc, snapshot)

    expect(readCanvasSnapshot(doc, canvasId)).toEqual(snapshot)
    expect(readCanvasSnapshot(doc, canvasId).widgets).not.toHaveProperty('b')
    expect(readCanvasSnapshot(doc, canvasId).relations).not.toHaveProperty('outside')
  })

  it('converges after concurrent structural edits delivered in different orders', () => {
    const seed = new Y.Doc()
    writeCanvasSnapshot(seed, content(note('base', 'seed')))
    const initial = Y.encodeStateAsUpdate(seed)
    const left = new Y.Doc()
    const right = new Y.Doc()
    Y.applyUpdate(left, initial)
    Y.applyUpdate(right, initial)

    writeCanvasSnapshot(left, {
      ...content(note('base', 'seed', 40)),
      widgets: { base: note('base', 'seed', 40), left: note('left', 'L') },
    })
    writeCanvasSnapshot(right, {
      ...content(note('base', 'seed', 80)),
      widgets: { base: note('base', 'seed', 80), right: note('right', 'R') },
    })

    exchange(left, right)

    expect(Y.encodeStateAsUpdate(left)).toEqual(Y.encodeStateAsUpdate(right))
    expect(readCanvasSnapshot(left, canvasId)).toEqual(readCanvasSnapshot(right, canvasId))
  })

  it('retains concurrent character insertions in notes', () => {
    const seed = new Y.Doc()
    writeCanvasSnapshot(seed, content(note('note', 'abcd')))
    const initial = Y.encodeStateAsUpdate(seed)
    const left = new Y.Doc()
    const right = new Y.Doc()
    Y.applyUpdate(left, initial)
    Y.applyUpdate(right, initial)

    writeCanvasSnapshot(left, content(note('note', 'aL-bcd')))
    writeCanvasSnapshot(right, content(note('note', 'abc-Rd')))
    exchange(left, right)

    const merged = (readCanvasSnapshot(left, canvasId).widgets.note!.data as { text: string }).text
    expect(merged).toContain('L-')
    expect(merged).toContain('-R')
    expect(readCanvasSnapshot(right, canvasId).widgets.note!.data).toEqual({ text: merged })
  })

  it('drops malformed entities at the untrusted CRDT boundary', () => {
    const doc = new Y.Doc()
    const widgets = doc.getMap<Y.Map<unknown>>('widgets')
    doc.getMap('canvas').set('id', canvasId)
    doc.getMap('canvas').set('name', 'Canvas A')
    const malformed = new Y.Map<unknown>()
    malformed.set('id', 'bad')
    malformed.set('type', 'not-a-widget')
    widgets.set('bad', malformed)

    expect(readCanvasSnapshot(doc, canvasId).widgets).toEqual({})
  })

  it('rejects oversized note payloads before applying them to the store', () => {
    const doc = new Y.Doc()
    writeCanvasSnapshot(doc, content(note('note', 'safe')))
    const text = doc.getMap<Y.Text>('texts').get('note')!
    text.insert(0, 'x'.repeat(2_000_001))

    expect(() => readCanvasSnapshot(doc, canvasId)).toThrow(CollaborationPayloadError)
  })

  it('encodes a single-widget move without scanning it into a full-canvas update', () => {
    const doc = new Y.Doc()
    const widgets = Object.fromEntries(
      Array.from({ length: 500 }, (_, index) => [`note-${index}`, note(`note-${index}`, `text ${index}`, index * 20)]),
    )
    const before = { ...content(widgets['note-0']!), widgets }
    writeCanvasSnapshot(doc, before)
    const after = {
      ...before,
      widgets: {
        ...widgets,
        'note-250': { ...widgets['note-250']!, position: { x: 999, y: 888 } },
      },
    }
    const updates: Uint8Array[] = []
    doc.on('update', (update) => updates.push(update))

    writeCanvasSnapshot(doc, after, LOCAL_STORE_ORIGIN, before)

    expect(updates).toHaveLength(1)
    expect(updates[0]!.byteLength).toBeLessThan(512)
    expect(readCanvasSnapshot(doc, canvasId).widgets['note-250']!.position).toEqual({ x: 999, y: 888 })
  })
})
