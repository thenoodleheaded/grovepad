// Shared entry point for turning file bytes into an importable board, used by
// both the account menu's file picker and the native shell's open-with
// handler. Keeping one parser means both entry points get the same package
// vs. legacy-JSON detection and the same validation guarantees.

import type { HydratedPersistedBoard } from '../types/persistence'
import { looksLikeZipArchive, readGrovepadPackage } from './grovepadPackage'
import { parsePersistedBoard } from './persistedBoardSchema'

export interface ImportedBoardFile {
  board: HydratedPersistedBoard
  media: Array<{ key: string; blob: Blob }>
}

/** Detect `.grovepad` package vs. legacy JSON backup and parse accordingly. */
export async function parseImportedBoardFile(
  bytes: Uint8Array,
  filename: string,
): Promise<ImportedBoardFile> {
  if (looksLikeZipArchive(bytes) || filename.endsWith('.grovepad')) {
    return readGrovepadPackage(bytes)
  }
  const parsed = parsePersistedBoard(JSON.parse(new TextDecoder().decode(bytes)))
  if (!parsed) throw new Error('Invalid board')
  return { board: parsed, media: [] }
}
