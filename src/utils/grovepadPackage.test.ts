import { describe, expect, it } from 'vitest'
import type { HydratedPersistedBoard } from '../types/persistence'
import { makeWidget } from '../test/factories'
import currentBoardFixture from './fixtures/boards/v2.json?raw'
import { canonicalJson } from './cloudDocuments'
import { parsePersistedBoard, serializePersistedBoard } from './persistedBoardSchema'
import {
  buildGrovepadPackage,
  GrovepadPackageTooNewError,
  looksLikeZipArchive,
  readGrovepadPackage,
} from './grovepadPackage'
import { readZip } from './zipArchive'
import { excalidrawBlobKey } from './excalidrawFiles'

function fixtureBoard(): HydratedPersistedBoard {
  const board = parsePersistedBoard(JSON.parse(currentBoardFixture))
  if (!board) throw new Error('fixture failed to parse')
  return board
}

/** A board with a media widget whose blob is served by the injected loader. */
function boardWithMedia(): { board: HydratedPersistedBoard; blob: Blob } {
  const base = fixtureBoard()
  const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: 'image/webp' })
  const board: HydratedPersistedBoard = {
    ...base,
    widgets: {
      ...base.widgets,
      photo: makeWidget({
        id: 'photo',
        type: 'media',
        title: 'Photo',
        position: { x: 300, y: 0 },
        data: { url: '', caption: '', localBlobKey: 'photo' },
      }),
    },
  }
  return { board, blob }
}

describe('grovepadPackage', () => {
  it('round-trips a board through the package unchanged', async () => {
    const board = fixtureBoard()
    const before = canonicalJson(serializePersistedBoard(board))

    const bytes = await buildGrovepadPackage(board)
    expect(looksLikeZipArchive(bytes)).toBe(true)

    const restored = await readGrovepadPackage(bytes)
    const after = canonicalJson(serializePersistedBoard(restored.board))
    expect(after).toBe(before)
    expect(restored.media).toEqual([])
  })

  it('carries media content-addressed and restores it by key', async () => {
    const { board, blob } = boardWithMedia()
    const bytes = await buildGrovepadPackage(board, async () => blob)

    const restored = await readGrovepadPackage(bytes)
    expect(restored.media).toHaveLength(1)
    expect(restored.media[0]!.key).toBe('photo')
    expect([...new Uint8Array(await restored.media[0]!.blob.arrayBuffer())]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(restored.board.widgets.photo).toBeDefined()
  })

  it('deduplicates identical media shared by two widgets', async () => {
    const { board, blob } = boardWithMedia()
    board.widgets.photoCopy = {
      ...board.widgets.photo!,
      id: 'photoCopy',
      data: { url: '', caption: '', localBlobKey: 'photoCopy' },
    }
    const bytes = await buildGrovepadPackage(board, async () => blob)

    const files = await readZip(bytes)
    const mediaFiles = [...files.keys()].filter((name) => name.startsWith('media/'))
    expect(mediaFiles).toHaveLength(1) // one blob on disk...

    const restored = await readGrovepadPackage(bytes)
    expect(restored.media.map((m) => m.key).sort()).toEqual(['photo', 'photoCopy']) // ...restored to both keys
  })

  it('writes a manifest, an index, and one file per canvas', async () => {
    const bytes = await buildGrovepadPackage(fixtureBoard())
    const files = await readZip(bytes)
    expect(files.has('manifest.json')).toBe(true)
    expect(files.has('index.json')).toBe(true)
    expect(files.has('canvases/canvas.json')).toBe(true)

    const manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json'))) as Record<string, unknown>
    expect(manifest.format).toBe('grovepad-package')
    expect(manifest.boardVersion).toBe(2)
    expect(manifest.canvasIds).toEqual(['canvas'])
  })

  it('refuses a package that requires a newer reader', async () => {
    const bytes = await buildGrovepadPackage(fixtureBoard())
    const files = await readZip(bytes)
    const manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json'))) as Record<string, unknown>
    manifest.minReader = 99
    // Re-pack with the tampered manifest via a fresh package build path.
    const { createZip } = await import('./zipArchive')
    const encoder = new TextEncoder()
    const entries = [...files.entries()].map(([name, data]) => ({
      name,
      data: name === 'manifest.json' ? encoder.encode(JSON.stringify(manifest)) : data,
    }))
    const tampered = await createZip(entries)
    await expect(readGrovepadPackage(tampered)).rejects.toBeInstanceOf(GrovepadPackageTooNewError)
  })

  it('rejects bytes that are not a Grovepad package', async () => {
    await expect(readGrovepadPackage(new TextEncoder().encode('nope'))).rejects.toThrow()
  })
})

describe('drawing-family media completeness', () => {
  // Excalidraw scenes and annotation backgrounds live in the same blob store
  // as media widgets, under their own key shapes. A backup that only asks
  // media widgets restores those widgets blank, permanently — the header of
  // grovepadPackage.ts promises "without losing images".
  const EXCALIDRAW_BYTES = [1, 2, 3, 4]
  const LEGACY_BYTES = [9, 9, 9, 9]
  const ANNOTATION_BYTES = [5, 6, 7, 8]

  function boardWithDrawingBlobs(): { board: HydratedPersistedBoard; blobs: Map<string, Blob> } {
    const base = fixtureBoard()
    const blobs = new Map<string, Blob>([
      [excalidrawBlobKey('sketch', 'file1'), new Blob([new Uint8Array(EXCALIDRAW_BYTES)], { type: 'image/png' })],
      [excalidrawBlobKey('legacy', 'file2'), new Blob([new Uint8Array(LEGACY_BYTES)], { type: 'image/png' })],
      ['annotation:reference:ref-1', new Blob([new Uint8Array(ANNOTATION_BYTES)], { type: 'image/webp' })],
    ])
    const board: HydratedPersistedBoard = {
      ...base,
      widgets: {
        ...base.widgets,
        sketch: makeWidget({
          id: 'sketch', type: 'sketchpad', title: 'Diagram', position: { x: 600, y: 0 },
          // The scene rides under data.diagram; mode deliberately left as ink to
          // pin that enumeration ignores the currently shown mode — specialist
          // state survives mode switches and must still be exported.
          data: {
            height: 240, strokes: [],
            diagram: { elements: [], appState: {}, files: [{ id: 'file1', mimeType: 'image/png', createdAt: 1 }], updatedAt: '2026-01-01T00:00:00.000Z' },
            skinStates: { annotation: {} },
          },
        }),
        legacy: makeWidget({
          id: 'legacy', type: 'excalidraw', title: 'Old drawing', position: { x: 900, y: 0 },
          // The legacy standalone type keeps ExcalidrawData at the TOP level.
          data: { elements: [], appState: {}, files: [{ id: 'file2', mimeType: 'image/png', createdAt: 1 }], updatedAt: '2026-01-01T00:00:00.000Z' },
        }),
        reference: makeWidget({
          id: 'reference', type: 'sketchpad', title: 'Reference', position: { x: 1200, y: 0 },
          data: {
            height: 240, strokes: [],
            skinStates: { annotation: { localBlobKey: 'annotation:reference:ref-1', mimeType: 'image/webp', fileName: 'ref.webp', sourceUrl: '' } },
          },
        }),
      },
    }
    return { board, blobs }
  }

  it('carries excalidraw embeds and annotation references in the media manifest', async () => {
    const { board, blobs } = boardWithDrawingBlobs()
    const bytes = await buildGrovepadPackage(board, async (key) => blobs.get(key) ?? null)

    const restored = await readGrovepadPackage(bytes)
    expect(restored.media.map((entry) => entry.key).sort()).toEqual([
      'annotation:reference:ref-1',
      excalidrawBlobKey('legacy', 'file2'),
      excalidrawBlobKey('sketch', 'file1'),
    ].sort())

    const byKey = new Map(restored.media.map((entry) => [entry.key, entry.blob]))
    const bytesOf = async (key: string) => [...new Uint8Array(await byKey.get(key)!.arrayBuffer())]
    expect(await bytesOf(excalidrawBlobKey('sketch', 'file1'))).toEqual(EXCALIDRAW_BYTES)
    expect(await bytesOf(excalidrawBlobKey('legacy', 'file2'))).toEqual(LEGACY_BYTES)
    expect(await bytesOf('annotation:reference:ref-1')).toEqual(ANNOTATION_BYTES)
  })
})
