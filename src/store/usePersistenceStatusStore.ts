import { create } from 'zustand'
import type { PersistedBoard } from '../types/persistence'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
export type SyncState = 'off' | 'guest' | 'saving' | 'synced' | 'error'

interface CloudConflict {
  local: PersistedBoard
  cloud: PersistedBoard
  cloudUpdatedAt: string | null
}

export interface PersistenceCompatibilityBlock {
  foundVersion: number
  source: 'local' | 'cloud'
}

const SYNC_ENABLED_KEY = 'grovepad:cloud-sync:v1'

function loadSyncEnabled(): boolean {
  try {
    return localStorage.getItem(SYNC_ENABLED_KEY) === 'on'
  } catch {
    return false
  }
}

interface PersistenceStatusState {
  localSave: SaveState
  cloudSync: SyncState
  /** Account sync is opt-in: off by default, persisted per browser. */
  syncEnabled: boolean
  lastSyncedAt: number | null
  /** Browser connectivity is advisory. Local saving remains available while false. */
  networkOnline: boolean
  /** True after the installable web shell has an active service worker. */
  serviceWorkerReady: boolean
  conflict: CloudConflict | null
  compatibilityBlock: PersistenceCompatibilityBlock | null
  deployUpdateAvailable: boolean
  setLocalSave: (state: SaveState) => void
  setCloudSync: (state: SyncState) => void
  setSyncEnabled: (enabled: boolean) => void
  setLastSyncedAt: (at: number | null) => void
  setNetworkOnline: (online: boolean) => void
  setServiceWorkerReady: (ready: boolean) => void
  setConflict: (conflict: CloudConflict | null) => void
  setCompatibilityBlock: (block: PersistenceCompatibilityBlock | null) => void
  setDeployUpdateAvailable: (available: boolean) => void
}

export const usePersistenceStatusStore = create<PersistenceStatusState>()((set) => ({
  localSave: 'idle',
  cloudSync: loadSyncEnabled() ? 'guest' : 'off',
  syncEnabled: loadSyncEnabled(),
  lastSyncedAt: null,
  networkOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  serviceWorkerReady: false,
  conflict: null,
  compatibilityBlock: null,
  deployUpdateAvailable: false,
  setLocalSave: (localSave) => set({ localSave }),
  setCloudSync: (cloudSync) => set({ cloudSync }),
  setSyncEnabled: (syncEnabled) => {
    try {
      localStorage.setItem(SYNC_ENABLED_KEY, syncEnabled ? 'on' : 'off')
    } catch {
      // Storage unavailable — the toggle still applies for this session.
    }
    set({ syncEnabled })
  },
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setNetworkOnline: (networkOnline) => set({ networkOnline }),
  setServiceWorkerReady: (serviceWorkerReady) => set({ serviceWorkerReady }),
  setConflict: (conflict) => set({ conflict }),
  setCompatibilityBlock: (compatibilityBlock) => set({ compatibilityBlock }),
  setDeployUpdateAvailable: (deployUpdateAvailable) => set({ deployUpdateAvailable }),
}))
