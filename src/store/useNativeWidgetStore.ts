import { create } from 'zustand'

const STORAGE_KEY = 'grovepad:native-note-widget:v1'

type NativeWidgetSyncStatus = 'idle' | 'syncing' | 'synced' | 'unsupported' | 'error'

interface NativeWidgetState {
  /** Device-local choice: native home-screen placement is not board data. */
  selectedWidgetId: string | null
  syncStatus: NativeWidgetSyncStatus
  lastError: string | null
  setSelectedWidgetId: (widgetId: string | null) => void
  setSyncState: (syncStatus: NativeWidgetSyncStatus, lastError?: string | null) => void
}

function readSelectedWidgetId(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return typeof value === 'string' && value.length > 0 ? value : null
  } catch {
    return null
  }
}

function persistSelectedWidgetId(widgetId: string | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (widgetId === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(widgetId))
  } catch {
    // A blocked localStorage must never interfere with editing the board.
  }
}

export const useNativeWidgetStore = create<NativeWidgetState>()((set) => ({
  selectedWidgetId: readSelectedWidgetId(),
  syncStatus: 'idle',
  lastError: null,
  setSelectedWidgetId: (selectedWidgetId) => {
    persistSelectedWidgetId(selectedWidgetId)
    set({ selectedWidgetId, syncStatus: 'idle', lastError: null })
  },
  setSyncState: (syncStatus, lastError = null) => set({ syncStatus, lastError }),
}))
