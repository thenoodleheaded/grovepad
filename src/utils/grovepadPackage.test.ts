import { describe, expect, it } from 'vitest'
import type { HydratedPersistedBoard } from '../types/persistence'
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
      photo: {
        id: 'photo',
        type: 'media',
        title: 'Photo',
        canvasId: 'canvas',
        position: { x: 300, y: 0 },
        size: { width: 240, height: 160 },
        data: { url: '', caption: '', localBlobKey: 'photo' },
        metadata: { badges: [] },
      },
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
