import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabase'
import type { HydratedPersistedBoard, PersistedBoard } from '../types/persistence'
import {
  CLOUD_CANVAS_FORMAT,
  CLOUD_CANVAS_VERSION,
  CLOUD_INDEX_FORMAT,
  canonicalJson,
  decodeCloudDocument,
  encodeCloudDocument,
  isCloudBoardIndex,
  isCloudCanvasDocument,
  joinCloudBoard,
  sha256Hex,
  splitCloudBoard,
  type CloudCanvasDocument,
} from './cloudDocuments'
import {
  FuturePersistedBoardVersionError,
  getFuturePersistedBoardVersion,
  parsePersistedBoard,
} from './persistedBoardSchema'

// New clients use board_indexes + canvas_docs. The legacy boards row remains
// dual-written during the transition so stale clients and rollback builds keep
// a complete copy. The index's server timestamp is the multi-row commit marker.

interface LegacyBoardRow {
  data: unknown
  updated_at: unknown
}

interface BoardIndexRow {
  doc: unknown
  meta: unknown
  checksum: unknown
  updated_at: unknown
}

interface CanvasDocumentRow {
  canvas_id: unknown
  body: unknown
  meta: unknown
  checksum: unknown
  updated_at: unknown
}

interface CloudMetadataRow {
  canvas_id: unknown
  checksum: unknown
}

export interface CloudBoardResult {
  board: HydratedPersistedBoard
  updatedAt: string | null
  source: 'documents' | 'legacy'
}

export interface CloudPushResult {
  mode: 'documents' | 'legacy-fallback'
  changedCanvases: number
  deletedCanvases: number
}

export interface CloudDocumentChangePlan {
  changedCanvasIds: string[]
  deletedCanvasIds: string[]
  hasChanges: boolean
}

export function planCloudDocumentChanges(
  localIndexChecksum: string,
  localCanvasChecksums: ReadonlyMap<string, string>,
  remoteIndexChecksum: string | null,
  remoteCanvasChecksums: ReadonlyMap<string, string>,
): CloudDocumentChangePlan {
  const changedCanvasIds = [...localCanvasChecksums].flatMap(([canvasId, checksum]) =>
    remoteCanvasChecksums.get(canvasId) === checksum ? [] : [canvasId],
  )
  const deletedCanvasIds = [...remoteCanvasChecksums.keys()].filter(
    (canvasId) => !localCanvasChecksums.has(canvasId),
  )
  return {
    changedCanvasIds,
    deletedCanvasIds,
    hasChanges:
      remoteIndexChecksum !== localIndexChecksum ||
      changedCanvasIds.length > 0 ||
      deletedCanvasIds.length > 0,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null
  return value
}

function isLater(left: string | null, right: string | null): boolean {
  if (!left) return false
  if (!right) return true
  return Date.parse(left) > Date.parse(right)
}

/** PostgREST codes used while the new migration is not applied or schema cache is stale. */
export function isMissingCloudDocumentSchema(error: unknown): boolean {
  if (!isRecord(error)) return false
  const code = typeof error.code === 'string' ? error.code : ''
  return code === '42P01' || code === 'PGRST204' || code === 'PGRST205'
}

async function fetchLegacyBoard(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ board: HydratedPersistedBoard; updatedAt: string | null } | null> {
  const { data, error } = await supabase
    .from('boards')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as LegacyBoardRow
  const futureVersion = getFuturePersistedBoardVersion(row.data)
  if (futureVersion !== null) throw new FuturePersistedBoardVersionError(futureVersion)
  const board = parsePersistedBoard(row.data)
  if (!board) throw new Error('Cloud board has an unsupported or corrupt legacy shape')
  return { board, updatedAt: timestamp(row.updated_at) }
}

function canvasEncoding(meta: unknown): 'gzip' | 'identity' | null {
  if (!isRecord(meta)) return null
  return meta.encoding === 'gzip' || meta.encoding === 'identity' ? meta.encoding : null
}

async function decodeCanvasRow(row: CanvasDocumentRow): Promise<CloudCanvasDocument> {
  const canvasId = stringField(row.canvas_id)
  const body = stringField(row.body)
  const checksum = stringField(row.checksum)
  const encoding = canvasEncoding(row.meta)
  if (!canvasId || !body || !checksum || !encoding) throw new Error('Invalid cloud canvas envelope')
  const decoded = await decodeCloudDocument(body, encoding, checksum)
  if (!isCloudCanvasDocument(decoded) || decoded.canvasId !== canvasId) {
    throw new Error('Cloud canvas body does not match its row')
  }
  return decoded
}

async function fetchDocumentBoard(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  board: HydratedPersistedBoard
  updatedAt: string | null
  complete: boolean
} | null | 'schema-missing'> {
  const { data: rawIndex, error: indexError } = await supabase
    .from('board_indexes')
    .select('doc, meta, checksum, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (indexError) {
    if (isMissingCloudDocumentSchema(indexError)) return 'schema-missing'
    throw indexError
  }
  if (!rawIndex) return null
  const indexRow = rawIndex as BoardIndexRow
  const indexChecksum = stringField(indexRow.checksum)
  if (!indexChecksum || await sha256Hex(canonicalJson(indexRow.doc)) !== indexChecksum) {
    throw new Error('Cloud board index checksum mismatch')
  }
  if (isRecord(indexRow.doc) &&
      indexRow.doc.format === CLOUD_INDEX_FORMAT &&
      typeof indexRow.doc.boardVersion === 'number' &&
      indexRow.doc.boardVersion > 2) {
    throw new FuturePersistedBoardVersionError(indexRow.doc.boardVersion)
  }
  if (!isCloudBoardIndex(indexRow.doc)) throw new Error('Cloud board index has an unsupported shape')

  const { data: rawCanvases, error: canvasError } = await supabase
    .from('canvas_docs')
    .select('canvas_id, body, meta, checksum, updated_at')
    .eq('user_id', userId)
  if (canvasError) {
    if (isMissingCloudDocumentSchema(canvasError)) return 'schema-missing'
    throw canvasError
  }
  const rows = (rawCanvases ?? []) as CanvasDocumentRow[]
  const decoded = await Promise.all(rows.map(decodeCanvasRow))
  const expectedIds = Object.keys(indexRow.doc.canvases)
  const foundIds = new Set(decoded.map((canvas) => canvas.canvasId))
  const complete = expectedIds.every((canvasId) => foundIds.has(canvasId))
  const board = parsePersistedBoard(joinCloudBoard(indexRow.doc, decoded))
  if (!board) throw new Error('Reassembled cloud documents have a corrupt board shape')
  return { board, updatedAt: timestamp(indexRow.updated_at), complete }
}

/** Fetch authoritative split documents, falling back to the retained legacy row. */
export async function fetchCloudBoard(userId: string): Promise<CloudBoardResult | null> {
  const supabase = await getSupabaseClient()
  if (!supabase) throw new Error('Cloud client unavailable')
  const legacy = await fetchLegacyBoard(supabase, userId)
  let documents: Awaited<ReturnType<typeof fetchDocumentBoard>>
  try {
    documents = await fetchDocumentBoard(supabase, userId)
  } catch (error) {
    if (error instanceof FuturePersistedBoardVersionError || !legacy) throw error
    // The retained monolithic row is the recovery receipt for a damaged or
    // interrupted split-document generation. Reconciliation rewrites it.
    return { ...legacy, source: 'legacy' }
  }
  if (documents === 'schema-missing' || documents === null) {
    return legacy ? { ...legacy, source: 'legacy' } : null
  }
  // Legacy is written first and the index last. A newer legacy timestamp means
  // a stale client wrote after our last committed split-document generation,
  // or a multi-row write stopped before its index commit marker.
  if (!documents.complete) {
    if (!legacy) throw new Error('Cloud board generation is incomplete and has no recovery row')
    return { ...legacy, source: 'legacy' }
  }
  if (legacy && isLater(legacy.updatedAt, documents.updatedAt)) {
    return { ...legacy, source: 'legacy' }
  }
  return { board: documents.board, updatedAt: documents.updatedAt, source: 'documents' }
}

async function pushLegacyBoard(
  supabase: SupabaseClient,
  userId: string,
  board: PersistedBoard,
): Promise<void> {
  const { error } = await supabase
    .from('boards')
    .upsert({ user_id: userId, data: board, updated_at: new Date().toISOString() })
  if (error) throw error
}

function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

/**
 * Checksum-diff and dual-write one board. Legacy writes happen first; changed
 * canvas docs follow; the index upsert is the final server-stamped commit.
 */
export async function pushCloudBoard(
  userId: string,
  board: PersistedBoard,
): Promise<CloudPushResult> {
  const supabase = await getSupabaseClient()
  if (!supabase) throw new Error('Cloud client unavailable')
  const split = splitCloudBoard(board)
  const indexChecksum = await sha256Hex(canonicalJson(split.index))
  const encodedCanvases = await Promise.all(
    Object.values(split.canvases).map(async (canvas) => ({
      canvas,
      encoded: await encodeCloudDocument(canvas),
    })),
  )

  const [indexMetadata, canvasMetadata] = await Promise.all([
    supabase
      .from('board_indexes')
      .select('checksum')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('canvas_docs')
      .select('canvas_id, checksum')
      .eq('user_id', userId),
  ])
  const schemaError = indexMetadata.error ?? canvasMetadata.error
  if (schemaError) {
    if (!isMissingCloudDocumentSchema(schemaError)) throw schemaError
    await pushLegacyBoard(supabase, userId, board)
    return { mode: 'legacy-fallback', changedCanvases: 0, deletedCanvases: 0 }
  }

  const remoteCanvasChecksums = new Map<string, string>()
  for (const raw of (canvasMetadata.data ?? []) as CloudMetadataRow[]) {
    const canvasId = stringField(raw.canvas_id)
    const checksum = stringField(raw.checksum)
    if (canvasId && checksum) remoteCanvasChecksums.set(canvasId, checksum)
  }
  const remoteIndexChecksum = isRecord(indexMetadata.data)
    ? stringField(indexMetadata.data.checksum)
    : null
  const localCanvasChecksums = new Map(
    encodedCanvases.map(({ canvas, encoded }) => [canvas.canvasId, encoded.checksum]),
  )
  const changePlan = planCloudDocumentChanges(
    indexChecksum,
    localCanvasChecksums,
    remoteIndexChecksum,
    remoteCanvasChecksums,
  )
  if (!changePlan.hasChanges) {
    return { mode: 'documents', changedCanvases: 0, deletedCanvases: 0 }
  }
  const changedCanvasIdSet = new Set(changePlan.changedCanvasIds)
  const changedCanvases = encodedCanvases.filter(({ canvas }) =>
    changedCanvasIdSet.has(canvas.canvasId),
  )

  // Belt-and-suspenders copy for rollback builds and stale clients.
  await pushLegacyBoard(supabase, userId, board)

  for (const batch of batches(changedCanvases, 20)) {
    const rows = batch.map(({ canvas, encoded }) => {
      const canvasMeta = split.index.canvases[canvas.canvasId]
      return {
        user_id: userId,
        canvas_id: canvas.canvasId,
        body: encoded.body,
        checksum: encoded.checksum,
        meta: {
          format: CLOUD_CANVAS_FORMAT,
          formatVersion: CLOUD_CANVAS_VERSION,
          encoding: encoded.encoding,
          compressedBytes: encoded.byteLength,
          uncompressedBytes: encoded.uncompressedBytes,
          name: canvasMeta?.name ?? 'Canvas',
          workspaceId: canvasMeta?.workspaceId ?? null,
          parentCanvasId: canvasMeta?.parentCanvasId ?? null,
          widgetCount: Object.keys(canvas.widgets).length,
          relationCount: Object.keys(canvas.relations).length,
          connectionCount: Object.keys(canvas.connections).length,
        },
      }
    })
    const { error } = await supabase.from('canvas_docs').upsert(rows)
    if (error) throw error
  }

  for (const batch of batches(changePlan.deletedCanvasIds, 50)) {
    const { error } = await supabase
      .from('canvas_docs')
      .delete()
      .eq('user_id', userId)
      .in('canvas_id', batch)
    if (error) throw error
  }

  const { error: indexWriteError } = await supabase.from('board_indexes').upsert({
    user_id: userId,
    doc: split.index,
    checksum: indexChecksum,
    meta: {
      format: CLOUD_INDEX_FORMAT,
      formatVersion: split.index.v,
      boardVersion: split.index.boardVersion,
      workspaceCount: Object.keys(split.index.workspaces).length,
      canvasCount: Object.keys(split.index.canvases).length,
      crossCanvasRelationCount: Object.keys(split.index.relations).length,
      crossCanvasConnectionCount: Object.keys(split.index.connections).length,
    },
  })
  if (indexWriteError) throw indexWriteError
  return {
    mode: 'documents',
    changedCanvases: changedCanvases.length,
    deletedCanvases: changePlan.deletedCanvasIds.length,
  }
}
