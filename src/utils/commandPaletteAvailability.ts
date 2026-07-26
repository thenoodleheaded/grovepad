import type { CollaborationRole } from '../collaboration/types'
import { canEditCollaborativeCanvas } from '../store/useCollaborationStore'

/**
 * Whether the document importer may be started at all.
 *
 * Every board write the import performs — `importMindmap`, then one
 * `updateWidgetData`/`setWidgetHydration` per card — is wrapped by the
 * collaboration permission guard, and a blocked call is a SILENT no-op that
 * returns nothing the caller can inspect. So a role that cannot edit must never
 * reach the importer: it would pay for a topology request plus one hydration
 * request per card, out of its own API budget, and receive nothing.
 *
 * `null` means no collaboration session at all — ordinary solo use — and must
 * stay allowed. `canEditCollaborativeCanvas(null)` is false, so the null arm
 * cannot be dropped without locking every solo user out of importing.
 */
export function documentImportAvailable(role: CollaborationRole | null): boolean {
  return role === null || canEditCollaborativeCanvas(role)
}

export function historyPaletteActionIds(canUndo: boolean, canRedo: boolean): string[] {
  return [canUndo ? 'action-undo' : null, canRedo ? 'action-redo' : null].filter((id): id is string => id !== null)
}
