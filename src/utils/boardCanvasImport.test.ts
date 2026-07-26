import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { HydratedPersistedBoard } from '../types/persistence'
import type { SketchpadData } from '../types/spatial'
import { makeWidget } from '../test/factories'
import { useWidgetStore } from '../store/useWidgetStore'
import { buildBoardSnapshot } from './persistence'
import { parsePersistedBoard } from './persistedBoardSchema'
import { readMediaBlob } from './boardDatabase'
import { excalidrawBlobKey } from './excalidrawFiles'
import { importBoardFileOntoCanvas } from './boardCanvasImport'

// ---------------------------------------------------------------------------
// The import half of drawing-family media. Excalidraw blobs are read back
// under keys DERIVED from the current widget id, and imports mint fresh
// widget ids — so the blobs must land under the minted ids' keys, or the
// imported copies render blank. Writing them under the exported (old-id)
// keys is precisely the broken variant these tests exist to reject.
// Annotation keys are STORED in skin state, so they are reminted and the
// state rewritten. Driven through the real store and fake-indexeddb.
// ---------------------------------------------------------------------------

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

const EXCALIDRAW_BYTES = [1, 2, 3, 4]
const LEGACY_BYTES = [9, 9, 9, 9]
const ANNOTATION_BYTES = [5, 6, 7, 8]

function packageFixture(): { board: HydratedPersistedBoard; media: Array<{ key: string; blob: Blob }> } {
  const board: HydratedPersistedBoard = {
    format: 'grovepad-board',
    v: 2,
    workspaces: {
      workspace: { id: 'workspace', name: 'Sender', rootCanvasId: 'canvas', createdAt: 1 },
    },
    canvases: {
      canvas: { id: 'canvas', name: 'Origin', workspaceId: 'workspace', parentCanvasId: null },
    },
    widgets: {
      sketch: makeWidget({
        id: 'sketch', canvasId: 'canvas', type: 'sketchpad', title: 'Diagram',
        data: {
          height: 240, strokes: [],
          diagram: { elements: [], appState: {}, files: [{ id: 'file1', mimeType: 'image/png', createdAt: 1 }], updatedAt: '2026-01-01T00:00:00.000Z' },
        },
      }),
      legacy: makeWidget({
        id: 'legacy', canvasId: 'canvas', type: 'excalidraw', title: 'Old drawing', position: { x: 400, y: 0 },
        data: { elements: [], appState: {}, files: [{ id: 'file2', mimeType: 'image/png', createdAt: 1 }], updatedAt: '2026-01-01T00:00:00.000Z' },
      }),
      reference: makeWidget({
        id: 'reference', canvasId: 'canvas', type: 'sketchpad', title: 'Reference', position: { x: 800, y: 0 },
        data: {
          height: 240, strokes: [],
          skinStates: { annotation: { localBlobKey: 'annotation:reference:ref-1', mimeType: 'image/webp', fileName: 'ref.webp', sourceUrl: '' } },
        },
      }),
    },
    relations: {}, connections: {}, glues: {},
    activePacks: [], activeWorkspaceId: 'workspace', activeCanvasId: 'canvas', canvasViews: {},
  }
  const media = [
    { key: excalidrawBlobKey('sketch', 'file1'), blob: new Blob([new Uint8Array(EXCALIDRAW_BYTES)], { type: 'image/png' }) },
    { key: excalidrawBlobKey('legacy', 'file2'), blob: new Blob([new Uint8Array(LEGACY_BYTES)], { type: 'image/png' }) },
    { key: 'annotation:reference:ref-1', blob: new Blob([new Uint8Array(ANNOTATION_BYTES)], { type: 'image/webp' }) },
  ]
  return { board, media }
}

async function bytesAt(key: string): Promise<number[] | null> {
  const blob = await readMediaBlob(key)
  return blob ? [...new Uint8Array(await blob.arrayBuffer())] : null
}

describe('importing a package with drawing-family media', () => {
  it('writes excalidraw blobs under the minted widget ids their read path derives', async () => {
    const { board, media } = packageFixture()
    await importBoardFileOntoCanvas({ board, media, filename: 'sender.grovepad' })

    const widgets = Object.values(useWidgetStore.getState().widgets)
    const sketch = widgets.find((widget) => widget.title === 'Diagram')!
    const legacy = widgets.find((widget) => widget.title === 'Old drawing')!
    expect(sketch.id).not.toBe('sketch') // ids really are minted fresh

    // The read path derives excalidraw:<currentWidgetId>:<fileId>; the blob
    // must exist exactly there. This is the assertion that rejects a fix that
    // writes blobs under the exported old-id keys.
    expect(await bytesAt(excalidrawBlobKey(sketch.id, 'file1'))).toEqual(EXCALIDRAW_BYTES)
    expect(await bytesAt(excalidrawBlobKey(legacy.id, 'file2'))).toEqual(LEGACY_BYTES)
  })

  it('remints the stored annotation key and writes the blob under it', async () => {
    const { board, media } = packageFixture()
    await importBoardFileOntoCanvas({ board, media, filename: 'sender.grovepad' })

    const reference = Object.values(useWidgetStore.getState().widgets)
      .find((widget) => widget.title === 'Reference')!
    const annotation = (reference.data as SketchpadData).skinStates?.annotation as { localBlobKey?: string } | undefined
    const storedKey = annotation?.localBlobKey
    // Reminted, so a second import of the same package cannot alias this copy.
    expect(storedKey).toBeTruthy()
    expect(storedKey).not.toBe('annotation:reference:ref-1')
    expect(await bytesAt(storedKey!)).toEqual(ANNOTATION_BYTES)
  })

  it('gives each copy of a double import its own working blobs', async () => {
    const { board, media } = packageFixture()
    await importBoardFileOntoCanvas({ board, media, filename: 'sender.grovepad' })
    await importBoardFileOntoCanvas({ board, media, filename: 'sender.grovepad' })

    const sketches = Object.values(useWidgetStore.getState().widgets)
      .filter((widget) => widget.title === 'Diagram')
    expect(sketches).toHaveLength(2)
    for (const sketch of sketches) {
      expect(await bytesAt(excalidrawBlobKey(sketch.id, 'file1'))).toEqual(EXCALIDRAW_BYTES)
    }
  })
})
