import { create } from 'zustand'
import type { HydratedPersistedBoard } from '../types/persistence'

interface PendingBoardImport {
  board: HydratedPersistedBoard
  media: Array<{ key: string; blob: Blob }>
  /** Distinguishes an OS "open with" launch from the account menu's file picker, for messaging. */
  source: 'file-picker' | 'native-open'
}

interface BoardImportState {
  pending: PendingBoardImport | null
  requestImport: (pending: PendingBoardImport) => void
  clear: () => void
}

/** Owns the board-replace confirmation state shared by every import entry point. */
export const useBoardImportStore = create<BoardImportState>()((set) => ({
  pending: null,
  requestImport: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}))
