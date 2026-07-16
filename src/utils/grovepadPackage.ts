// The portable `.grovepad` document: a ZIP package that carries a whole board
// plus its media, so a canvas can be emailed, backed up, or opened on another
// device without losing images. It reuses the exact split/join and parse/
// serialize code the cloud path uses, so one corpus covers every transport.
//
//   manifest.json          format, versions, canvas list, media manifest, checksums
//   index.json             CloudBoardIndexDocument (workspaces, canvas tree, cross-canvas edges)
//   canvases/<id>.json     one CloudCanvasDocument per canvas
//   media/<sha256>.<ext>   content-addressed, de-duplicated media blobs

import {
  PERSISTED_BOARD_FORMAT,
  PERSISTED_BOARD_VERSION,
  type HydratedPersistedBoard,
  type PersistedBoardState,
} from '../types/persistence'
import { readMediaBlob } from './boardDatabase'
import {
  canonicalJson,
  isCloudBoardIndex,
  isCloudCanvasDocument,
  joinCloudBoard,
  sha256Hex,
  splitCloudBoard,
  type CloudCanvasDocument,
} from './cloudDocuments'
import {
  FuturePersistedBoardVersionError,
  parsePersistedBoard,
  serializePersistedBoard,
} from './persistedBoardSchema'
import { createZip, readZip, type ZipEntry } from './zipArchive'

const GROVEPAD_PACKAGE_FORMAT = 'grovepad-package' as const
const GROVEPAD_PACKAGE_VERSION = 1 as const

/** Raised when a package requires a newer reader than this build implements. */
export class GrovepadPackageTooNewError extends Error {
  readonly minReader: number

  constructor(minReader: number) {
    super(`This .grovepad package needs a newer Grovepad (reader ${minReader})`)
    this.name = 'GrovepadPackageTooNewError'
    this.minReader = minReader
  }
}

interface PackageMediaEntry {
  key: string
  path: string
  checksum: string
  bytes: number
  type: string
}

interface GrovepadManifest {
  format: typeof GROVEPAD_PACKAGE_FORMAT
  formatVersion: typeof GROVEPAD_PACKAGE_VERSION
  /** Lowest reader version that can safely open this package. */
  minReader: number
  kind: 'board'
  generator: 'grovepad'
  appVersion: string
  createdAt: string
  boardFormat: typeof PERSISTED_BOARD_FORMAT
  boardVersion: number
  canvasIds: string[]
  media: PackageMediaEntry[]
  /** sha256 of each canonicalized JSON entry, for tamper/corruption detection. */
  checksums: Record<string, string>
}

export interface ImportedPackage {
  board: HydratedPersistedBoard
  media: Array<{ key: string; blob: Blob }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function appVersion(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    return env?.VITE_APP_VERSION ?? 'dev'
  } catch {
    return 'dev'
  }
}

function extensionForType(type: string): string {
  if (type === 'image/webp') return 'webp'
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/gif') return 'gif'
  if (type === 'image/svg+xml') return 'svg'
  return 'bin'
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Build a `.grovepad` archive from the live board state. Media blobs are read
 * through `loadMedia` (injectable for tests) and content-addressed so the same
 * image pasted twice is stored once.
 */
export async function buildGrovepadPackage(
  state: PersistedBoardState,
  loadMedia: (key: string) => Promise<Blob | null> = readMediaBlob,
): Promise<Uint8Array> {
  const board = serializePersistedBoard(state)
  const split = splitCloudBoard(board)
  const encoder = new TextEncoder()
  const entries: ZipEntry[] = []
  const checksums: Record<string, string> = {}

  entries.push({ name: 'index.json', data: encoder.encode(JSON.stringify(split.index, null, 2)) })
  checksums['index.json'] = await sha256Hex(canonicalJson(split.index))

  const canvasIds: string[] = []
  for (const [canvasId, canvas] of Object.entries(split.canvases)) {
    const path = `canvases/${canvasId}.json`
    entries.push({ name: path, data: encoder.encode(JSON.stringify(canvas, null, 2)) })
    checksums[path] = await sha256Hex(canonicalJson(canvas))
    canvasIds.push(canvasId)
  }

  const media: PackageMediaEntry[] = []
  const storedPaths = new Set<string>()
  for (const widget of Object.values(board.widgets)) {
    if (widget.type !== 'media') continue
    const key = (widget.data as { localBlobKey?: unknown }).localBlobKey
    if (typeof key !== 'string' || !key) continue
    const blob = await loadMedia(key)
    if (!blob) continue
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const checksum = await sha256Bytes(bytes)
    const path = `media/${checksum}.${extensionForType(blob.type)}`
    if (!storedPaths.has(path)) {
      storedPaths.add(path)
      entries.push({ name: path, data: bytes })
    }
    media.push({ key, path, checksum, bytes: bytes.byteLength, type: blob.type || 'application/octet-stream' })
  }

  const manifest: GrovepadManifest = {
    format: GROVEPAD_PACKAGE_FORMAT,
    formatVersion: GROVEPAD_PACKAGE_VERSION,
    minReader: GROVEPAD_PACKAGE_VERSION,
    kind: 'board',
    generator: 'grovepad',
    appVersion: appVersion(),
    createdAt: new Date().toISOString(),
    boardFormat: PERSISTED_BOARD_FORMAT,
    boardVersion: split.index.boardVersion,
    canvasIds,
    media,
    checksums,
  }
  entries.unshift({ name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest, null, 2)) })
  return createZip(entries)
}

/**
 * Parse a `.grovepad` archive back into a validated board plus its media blobs.
 * Rejects packages that need a newer reader or carry a future board version
 * before any state is touched.
 */
export async function readGrovepadPackage(bytes: Uint8Array): Promise<ImportedPackage> {
  const files = await readZip(bytes)
  const manifestRaw = files.get('manifest.json')
  if (!manifestRaw) throw new Error('Not a Grovepad package: manifest.json is missing')
  const manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as unknown
  if (!isRecord(manifest) || manifest.format !== GROVEPAD_PACKAGE_FORMAT) {
    throw new Error('Unrecognized package: not a Grovepad document')
  }
  if (typeof manifest.minReader === 'number' && manifest.minReader > GROVEPAD_PACKAGE_VERSION) {
    throw new GrovepadPackageTooNewError(manifest.minReader)
  }
  if (typeof manifest.boardVersion === 'number' && manifest.boardVersion > PERSISTED_BOARD_VERSION) {
    throw new FuturePersistedBoardVersionError(manifest.boardVersion)
  }

  const indexRaw = files.get('index.json')
  if (!indexRaw) throw new Error('Package is missing its board index')
  const index = JSON.parse(new TextDecoder().decode(indexRaw)) as unknown
  if (!isCloudBoardIndex(index)) throw new Error('Package board index has an unsupported shape')

  const canvases: CloudCanvasDocument[] = []
  for (const canvasId of Object.keys(index.canvases)) {
    const raw = files.get(`canvases/${canvasId}.json`)
    if (!raw) continue
    const doc = JSON.parse(new TextDecoder().decode(raw)) as unknown
    if (isCloudCanvasDocument(doc) && doc.canvasId === canvasId) canvases.push(doc)
  }

  const board = parsePersistedBoard(joinCloudBoard(index, canvases))
  if (!board) throw new Error('Package board failed validation')

  const media: Array<{ key: string; blob: Blob }> = []
  if (Array.isArray(manifest.media)) {
    for (const entry of manifest.media) {
      if (!isRecord(entry) || typeof entry.key !== 'string' || typeof entry.path !== 'string') continue
      const data = files.get(entry.path)
      if (!data) continue
      const type = typeof entry.type === 'string' ? entry.type : 'application/octet-stream'
      media.push({ key: entry.key, blob: new Blob([data as BlobPart], { type }) })
    }
  }
  return { board, media }
}

/** True when the bytes begin with a local ZIP signature (`PK\x03\x04`). */
export function looksLikeZipArchive(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}
