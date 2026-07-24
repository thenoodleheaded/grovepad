import type { CollaborationRole } from './types'

export interface CanvasSharingRepository {
  ensureCanvas: (canvasId: string, name: string) => Promise<CollaborationRole>
  deleteCanvasCollaboration: (canvasId: string) => Promise<void>
}

export interface CanvasSharingControlInput {
  shared: boolean
  hasSession: boolean
  configured: boolean
  role: CollaborationRole | null
  busy: boolean
}

/**
 * A shared canvas with no resolved role may be a failed/old startup. Keep its
 * switch available so the signed-in user can recover it; the server still
 * verifies ownership before access is revoked.
 */
export function canToggleCanvasSharing({
  shared,
  hasSession,
  configured,
  role,
  busy,
}: CanvasSharingControlInput): boolean {
  if (!hasSession || !configured || busy) return false
  return !shared || role === null || role === 'owner'
}

/**
 * Registration must succeed before the local board is labelled shared.
 * Otherwise a network or policy error strands the UI in a shared-without-role
 * state whose owner controls cannot be used.
 */
export function registerCanvasSharing(
  repository: CanvasSharingRepository,
  canvasId: string,
  canvasName: string,
): Promise<CollaborationRole> {
  return repository.ensureCanvas(canvasId, canvasName)
}

/**
 * When a previous startup never resolved a role, ask the server for it again.
 * This repairs old stuck canvases without allowing a non-owner to revoke
 * somebody else's collaboration.
 */
export async function revokeCanvasSharing(
  repository: CanvasSharingRepository,
  canvasId: string,
  canvasName: string,
  knownRole: CollaborationRole | null,
): Promise<void> {
  const role = knownRole ?? await repository.ensureCanvas(canvasId, canvasName)
  if (role !== 'owner') throw new Error('Only the canvas owner can stop sharing')
  await repository.deleteCanvasCollaboration(canvasId)
}
