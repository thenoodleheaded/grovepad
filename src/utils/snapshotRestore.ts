import type { HydratedPersistedBoard, PersistedBoard } from '../types/persistence'

interface ProtectedSnapshotRestoreOptions {
  currentBoard: PersistedBoard
  currentRecovery: HydratedPersistedBoard
  target: HydratedPersistedBoard
  protect: (board: PersistedBoard) => Promise<void>
  load: (board: HydratedPersistedBoard) => void
}

/** Protection must complete before replacement; failure leaves the board untouched. */
export async function restoreWithProtectedSnapshot({
  currentBoard,
  currentRecovery,
  target,
  protect,
  load,
}: ProtectedSnapshotRestoreOptions): Promise<() => void> {
  await protect(currentBoard)
  load(target)
  return () => load(currentRecovery)
}
