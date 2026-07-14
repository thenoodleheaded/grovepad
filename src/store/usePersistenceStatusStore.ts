import { create } from 'zustand'
import type { PersistedBoard } from '../utils/persistence'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type SyncState = 'guest' | 'saving' | 'synced' | 'error'

interface CloudConflict {
  local: PersistedBoard
  cloud: PersistedBoard
  cloudUpdatedAt: string | null
}

interface PersistenceStatusState {
  localSave: SaveState
  cloudSync: SyncState
  lastSyncedAt: number | null
  conflict: CloudConflict | null
  setLocalSave: (state: SaveState) => void
  setCloudSync: (state: SyncState) => void
  setLastSyncedAt: (at: number | null) => void
  setConflict: (conflict: CloudConflict | null) => void
}

export const usePersistenceStatusStore = create<PersistenceStatusState>()((set) => ({
  localSave: 'idle',
  cloudSync: 'guest',
  lastSyncedAt: null,
  conflict: null,
  setLocalSave: (localSave) => set({ localSave }),
  setCloudSync: (cloudSync) => set({ cloudSync }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setConflict: (conflict) => set({ conflict }),
}))
