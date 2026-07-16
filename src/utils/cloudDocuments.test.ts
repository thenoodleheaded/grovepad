import { describe, expect, it } from 'vitest'
import type { HydratedPersistedBoard } from '../types/persistence'
import {
  canonicalJson,
  decodeCloudDocument,
  encodeCloudDocument,
  joinCloudBoard,
  splitCloudBoard,
} from './cloudDocuments'
import { parsePersistedBoard, serializePersistedBoard } from './persistedBoardSchema'

function board(): HydratedPersistedBoard {
  return parsePersistedBoard({
    format: 'grovepad-board',
    v: 2,
    futureBoardField: { retained: true },
    workspaces: {
      ws: { id: 'ws', name: 'Workspace', rootCanvasId: 'a', createdAt: 1 },
    },
    canvases: {
      a: { id: 'a', name: 'A', workspaceId: 'ws', parentCanvasId: null },
      b: { id: 'b', name: 'B', workspaceId: 'ws', parentCanvasId: 'a' },
    },
    widgets: {
      one: { id: 'one', type: 'notes', title: 'One', canvasId: 'a', position: { x: 0, y: 0 }, size: { width: 240, height: 160 }, data: { text: '' }, metadata: { badges: [] } },
      two: { id: 'two', type: 'notes', title: 'Two', canvasId: 'a', position: { x: 300, y: 0 }, size: { width: 240, height: 160 }, data: { text: '' }, metadata: { badges: [] } },
      three: { id: 'three', type: 'notes', title: 'Three', canvasId: 'b', position: { x: 0, y: 0 }, size: { width: 240, height: 160 }, data: { text: '' }, metadata: { badges: [] } },
    },
    relations: {
      same: { id: 'same', fromId: 'one', toId: 'two', type: 'parent', isResolved: false },
      cross: { id: 'cross', fromId: 'one', toId: 'three', type: 'blocker', isResolved: false },
    },
    connections: {},
    groups: {
      same: { id: 'same', label: 'Same', widgetIds: ['one', 'two'], color: '#6366f1' },
      cross: { id: 'cross', label: 'Cross', widgetIds: ['one', 'three'], color: '#6366f1' },
    },
    activePacks: ['life'],
    activeWorkspaceId: 'ws',
    activeCanvasId: 'b',
    canvasViews: { b: { pan: { x: 10, y: 20 }, zoom: 1.2 } },
  })!
}

describe('cloud documents', () => {
  it('canonicalizes nested object keys without changing array order', () => {
    const left = { z: 1, nested: { beta: 2, alpha: 1 }, list: [{ y: 2, x: 1 }, 3] }
    const right = { list: [{ x: 1, y: 2 }, 3], nested: { alpha: 1, beta: 2 }, z: 1 }

    expect(canonicalJson(left)).toBe(canonicalJson(right))
    expect(canonicalJson({ list: [1, 2] })).not.toBe(canonicalJson({ list: [2, 1] }))
  })

  it('splits same-canvas records from index-owned cross-canvas records', () => {
    const source = serializePersistedBoard(board())
    const split = splitCloudBoard(source)

    expect(Object.keys(split.canvases.a!.widgets)).toEqual(['one', 'two'])
    expect(Object.keys(split.canvases.b!.widgets)).toEqual(['three'])
    expect(Object.keys(split.canvases.a!.relations)).toEqual(['same'])
    expect(Object.keys(split.index.relations)).toEqual(['cross'])
    expect(Object.keys(split.canvases.a!.groups)).toEqual(['same'])
    expect(Object.keys(split.index.groups)).toEqual(['cross'])
    expect(split.index.extra).toEqual({ futureBoardField: { retained: true } })
    expect(split.index).not.toHaveProperty('activeCanvasId')
    expect(split.index).not.toHaveProperty('canvasViews')
  })

  it('reassembles a board that passes the canonical parser unchanged', () => {
    const source = serializePersistedBoard(board())
    const split = splitCloudBoard(source)
    const reassembled = joinCloudBoard(split.index, Object.values(split.canvases))
    const parsed = parsePersistedBoard(reassembled)

    expect(parsed).not.toBeNull()
    expect(serializePersistedBoard(parsed!)).toEqual(source)
  })

  it('compresses, verifies, and decodes a canvas document', async () => {
    const canvas = splitCloudBoard(serializePersistedBoard(board())).canvases.a!
    const encoded = await encodeCloudDocument(canvas)
    const decoded = await decodeCloudDocument(encoded.body, encoded.encoding, encoded.checksum)

    expect(decoded).toEqual(canvas)
    expect(encoded.byteLength).toBeLessThan(encoded.uncompressedBytes)
    await expect(decodeCloudDocument(encoded.body, encoded.encoding, 'bad')).rejects.toThrow(
      'checksum mismatch',
    )
  })
})
