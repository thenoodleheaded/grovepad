import type { BinaryFileData, BinaryFiles } from '@excalidraw/excalidraw/types'
import type { ExcalidrawFileRef } from '../types/spatial'

/**
 * Excalidraw's own file store keys images by file id, not widget id, so the
 * board's shared media blob store needs a namespaced key per widget to avoid
 * collisions between two Excalidraw widgets that both embed an image.
 */
export function excalidrawBlobKey(widgetId: string, fileId: string): string {
  return `excalidraw:${widgetId}:${fileId}`
}

/** File ids present in `files` that aren't yet recorded in `knownRefs`. */
export function newExcalidrawFileIds(files: BinaryFiles, knownRefs: readonly ExcalidrawFileRef[]): string[] {
  const known = new Set(knownRefs.map((ref) => ref.id))
  return Object.keys(files).filter((id) => !known.has(id))
}

/**
 * Writes any newly-added embedded images to the local blob store (never
 * inline in board JSON) and returns the updated, deduplicated ref list.
 */
export async function persistNewExcalidrawFiles(
  widgetId: string,
  files: BinaryFiles,
  knownRefs: readonly ExcalidrawFileRef[],
): Promise<readonly ExcalidrawFileRef[]> {
  const newIds = newExcalidrawFileIds(files, knownRefs)
  if (newIds.length === 0) return knownRefs
  const { writeMediaBlob } = await import('./boardDatabase')
  const added: ExcalidrawFileRef[] = []
  for (const id of newIds) {
    const file = files[id]
    if (!file) continue
    const blob = await (await fetch(file.dataURL)).blob()
    await writeMediaBlob(excalidrawBlobKey(widgetId, id), blob)
    added.push({ id, mimeType: file.mimeType, createdAt: file.created })
  }
  return [...knownRefs, ...added]
}

/**
 * Reconstructs Excalidraw's `BinaryFiles` map from stored refs. Callers own
 * revoking the returned object URLs when the scene unmounts.
 */
export async function loadExcalidrawFiles(
  widgetId: string,
  refs: readonly ExcalidrawFileRef[],
): Promise<{ files: BinaryFiles; objectUrls: string[] }> {
  if (refs.length === 0) return { files: {}, objectUrls: [] }
  const { readMediaBlob } = await import('./boardDatabase')
  const files: BinaryFiles = {}
  const objectUrls: string[] = []
  for (const ref of refs) {
    const blob = await readMediaBlob(excalidrawBlobKey(widgetId, ref.id))
    if (!blob) continue
    const url = URL.createObjectURL(blob)
    objectUrls.push(url)
    files[ref.id] = {
      id: ref.id,
      mimeType: ref.mimeType,
      dataURL: url,
      created: ref.createdAt,
    } as BinaryFileData
  }
  return { files, objectUrls }
}
