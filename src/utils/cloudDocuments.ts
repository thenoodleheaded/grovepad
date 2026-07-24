import type { Connection } from '../types/circuit'
import {
  PERSISTED_BOARD_FORMAT,
  PERSISTED_BOARD_VERSION,
  type PersistedBoard,
} from '../types/persistence'
import type { Relation, Widget, WidgetGlue } from '../types/spatial'

export const CLOUD_INDEX_FORMAT = 'grovepad-board-index' as const
const CLOUD_INDEX_VERSION = 1 as const
export const CLOUD_CANVAS_FORMAT = 'grovepad-canvas' as const
export const CLOUD_CANVAS_VERSION = 1 as const

export interface CloudBoardIndexDocument {
  format: typeof CLOUD_INDEX_FORMAT
  v: typeof CLOUD_INDEX_VERSION
  boardFormat: typeof PERSISTED_BOARD_FORMAT
  boardVersion: typeof PERSISTED_BOARD_VERSION
  workspaces: PersistedBoard['workspaces']
  canvases: PersistedBoard['canvases']
  activePacks: PersistedBoard['activePacks']
  relations: PersistedBoard['relations']
  connections: PersistedBoard['connections']
  glues: PersistedBoard['glues']
  extra: Record<string, unknown>
}

export interface CloudCanvasDocument {
  format: typeof CLOUD_CANVAS_FORMAT
  v: typeof CLOUD_CANVAS_VERSION
  canvasId: string
  widgets: PersistedBoard['widgets']
  relations: PersistedBoard['relations']
  connections: PersistedBoard['connections']
  glues: PersistedBoard['glues']
}

export interface SplitCloudBoard {
  index: CloudBoardIndexDocument
  canvases: Record<string, CloudCanvasDocument>
}

export interface EncodedCloudDocument {
  body: string
  encoding: 'gzip' | 'identity'
  checksum: string
  byteLength: number
  uncompressedBytes: number
}

const CORE_BOARD_FIELDS = new Set([
  'format',
  'v',
  'workspaces',
  'canvases',
  'widgets',
  'relations',
  'connections',
  'glues',
  // Legacy grouping records — dropped at the split boundary.
  'groups',
  'activePacks',
  // Legacy device fields are intentionally discarded at the split boundary.
  'activeWorkspaceId',
  'activeCanvasId',
  'canvasViews',
])

function endpointCanvas(
  widgets: Record<string, Widget>,
  fromId: string,
  toId: string,
): string | null {
  const fromCanvas = widgets[fromId]?.canvasId
  return fromCanvas && fromCanvas === widgets[toId]?.canvasId ? fromCanvas : null
}

function glueCanvas(widgets: Record<string, Widget>, glue: WidgetGlue): string | null {
  const first = widgets[glue.widgetIds[0]!]?.canvasId
  if (!first) return null
  return glue.widgetIds.every((widgetId) => widgets[widgetId]?.canvasId === first)
    ? first
    : null
}

/** Split one canonical board into a small index and independently writable canvases. */
export function splitCloudBoard(board: PersistedBoard): SplitCloudBoard {
  const canvases = Object.fromEntries(
    Object.keys(board.canvases).map((canvasId) => [canvasId, {
      format: CLOUD_CANVAS_FORMAT,
      v: CLOUD_CANVAS_VERSION,
      canvasId,
      widgets: {},
      relations: {},
      connections: {},
      glues: {},
    } satisfies CloudCanvasDocument]),
  ) as Record<string, CloudCanvasDocument>
  for (const [widgetId, widget] of Object.entries(board.widgets)) {
    const canvas = canvases[widget.canvasId]
    if (canvas) canvas.widgets[widgetId] = widget
  }

  const indexRelations: Record<string, Relation> = {}
  for (const [relationId, relation] of Object.entries(board.relations)) {
    const canvasId = endpointCanvas(board.widgets, relation.fromId, relation.toId)
    const canvas = canvasId ? canvases[canvasId] : undefined
    if (canvas) canvas.relations[relationId] = relation
    else indexRelations[relationId] = relation
  }

  const indexConnections: Record<string, Connection> = {}
  for (const [connectionId, connection] of Object.entries(board.connections)) {
    const canvasId = endpointCanvas(board.widgets, connection.fromId, connection.toId)
    const canvas = canvasId ? canvases[canvasId] : undefined
    if (canvas) canvas.connections[connectionId] = connection
    else indexConnections[connectionId] = connection
  }

  const indexGlues: Record<string, WidgetGlue> = {}
  for (const [glueId, glue] of Object.entries(board.glues)) {
    const canvasId = glueCanvas(board.widgets, glue)
    const canvas = canvasId ? canvases[canvasId] : undefined
    if (canvas) canvas.glues[glueId] = glue
    else indexGlues[glueId] = glue
  }

  const extra = Object.fromEntries(
    Object.entries(board).filter(([key]) => !CORE_BOARD_FIELDS.has(key)),
  )
  return {
    index: {
      format: CLOUD_INDEX_FORMAT,
      v: CLOUD_INDEX_VERSION,
      boardFormat: PERSISTED_BOARD_FORMAT,
      boardVersion: PERSISTED_BOARD_VERSION,
      workspaces: board.workspaces,
      canvases: board.canvases,
      activePacks: board.activePacks,
      relations: indexRelations,
      connections: indexConnections,
      glues: indexGlues,
      extra,
    },
    canvases,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCloudBoardIndex(value: unknown): value is CloudBoardIndexDocument {
  return isRecord(value) &&
    value.format === CLOUD_INDEX_FORMAT &&
    value.v === CLOUD_INDEX_VERSION &&
    value.boardFormat === PERSISTED_BOARD_FORMAT &&
    value.boardVersion === PERSISTED_BOARD_VERSION &&
    isRecord(value.workspaces) &&
    isRecord(value.canvases) &&
    Array.isArray(value.activePacks) &&
    isRecord(value.relations) &&
    isRecord(value.connections) &&
    // Accept legacy documents that carry `groups` instead — their grouping
    // records are ignored on join, but the document itself remains readable.
    (isRecord(value.glues) || isRecord(value.groups)) &&
    isRecord(value.extra)
}

export function isCloudCanvasDocument(value: unknown): value is CloudCanvasDocument {
  return isRecord(value) &&
    value.format === CLOUD_CANVAS_FORMAT &&
    value.v === CLOUD_CANVAS_VERSION &&
    typeof value.canvasId === 'string' &&
    isRecord(value.widgets) &&
    isRecord(value.relations) &&
    isRecord(value.connections) &&
    (isRecord(value.glues) || isRecord(value.groups))
}

/** Reassemble transport documents; the board parser performs domain validation next. */
export function joinCloudBoard(
  index: CloudBoardIndexDocument,
  canvasDocuments: readonly CloudCanvasDocument[],
): PersistedBoard {
  const widgets: PersistedBoard['widgets'] = {}
  const relations: PersistedBoard['relations'] = { ...index.relations }
  const connections: PersistedBoard['connections'] = { ...index.connections }
  const glues: PersistedBoard['glues'] = { ...(index.glues ?? {}) }
  for (const canvas of canvasDocuments) {
    if (!index.canvases[canvas.canvasId]) continue
    Object.assign(widgets, canvas.widgets)
    Object.assign(relations, canvas.relations)
    Object.assign(connections, canvas.connections)
    Object.assign(glues, canvas.glues ?? {})
  }
  return {
    ...index.extra,
    format: index.boardFormat,
    v: index.boardVersion,
    workspaces: index.workspaces,
    canvases: index.canvases,
    widgets,
    relations,
    connections,
    glues,
    activePacks: index.activePacks,
  }
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeJsonValue(value[key])]),
  )
}

/** Stable JSON bytes: object insertion order never creates a false change. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value))
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function bytesToBytea(bytes: Uint8Array): string {
  return `\\x${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function byteaToBytes(value: string): Uint8Array {
  const hex = value.startsWith('\\x') ? value.slice(2) : value
  if (hex.length % 2 !== 0 || !/^[\da-f]*$/i.test(hex)) throw new Error('Invalid bytea body')
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16))
}

async function transformBytes(
  bytes: Uint8Array,
  format: 'gzip' | 'identity',
  direction: 'compress' | 'decompress',
): Promise<Uint8Array> {
  if (format === 'identity') return bytes
  const stream = direction === 'compress'
    ? new CompressionStream('gzip')
    : new DecompressionStream('gzip')
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(source).arrayBuffer())
}

export async function encodeCloudDocument(value: unknown): Promise<EncodedCloudDocument> {
  const json = canonicalJson(value)
  const source = new TextEncoder().encode(json)
  const supportsGzip = typeof CompressionStream !== 'undefined'
  const encoding = supportsGzip ? 'gzip' : 'identity'
  const body = await transformBytes(source, encoding, 'compress')
  return {
    body: bytesToBytea(body),
    encoding,
    checksum: await sha256Hex(json),
    byteLength: body.byteLength,
    uncompressedBytes: source.byteLength,
  }
}

export async function decodeCloudDocument(
  body: string,
  encoding: 'gzip' | 'identity',
  checksum: string,
): Promise<unknown> {
  const compressed = byteaToBytes(body)
  const bytes = await transformBytes(compressed, encoding, 'decompress')
  const json = new TextDecoder().decode(bytes)
  if (await sha256Hex(json) !== checksum) throw new Error('Cloud document checksum mismatch')
  return JSON.parse(json) as unknown
}
