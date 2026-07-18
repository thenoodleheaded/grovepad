import { create } from 'zustand'
import type { HydratedPersistedBoard } from '../types/persistence'

interface PendingBoardImport {
  board: HydratedPersistedBoard
  media: Array<{ key: string; blob: Blob }>
}

interface BoardImportState {
  pending: PendingBoardImport | null
  requestImport: (pending: PendingBoardImport) => void
  clear: () => void
}

/** Owns the replacement confirmation used only by legacy JSON backups. */
export const useBoardImportStore = create<BoardImportState>()((set) => ({
  pending: null,
  requestImport: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}))
