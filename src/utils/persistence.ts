import type { StoreApi } from 'zustand'
import type { PersistedBoard } from '../types/persistence'
import type { Vector2D } from '../types/spatial'
import { clampZoom } from '../types/spatial'
import { useAuthStore } from '../store/useAuthStore'
import { supabaseConfigured } from '../lib/supabase'
import { usePersistenceStatusStore } from '../store/usePersistenceStatusStore'
import { useToastStore } from '../store/useToastStore'
import { readBoardDatabase, saveRollingSnapshot, writeBoardDatabase } from './boardDatabase'
import { migrateLegacyBoard, parsePersistedBoard } from './persistedBoardSchema'

export type { PersistedBoard } from '../types/persistence'
export { parsePersistedBoard } from './persistedBoardSchema'

// ---------------------------------------------------------------------------
// Local persistence — the board and camera survive reloads.
//
// Writes are debounced module-level subscriptions on the Zustand stores, so
// saving never routes through React and never runs more than once per
// debounce window no matter how fast the user drags or pans. A trailing
// flush on pagehide/visibilitychange catches the final pending write.
//
// v2 adds workspaces + the canvas hierarchy. A v1 board (single flat canvas)
// is migrated by wrapping it in a default workspace whose root canvas adopts
// every widget.
// ---------------------------------------------------------------------------

const BOARD_KEY_V1 = 'grovepad:board:v1'
const BOARD_KEY = 'grovepad:board:v2'
const VIEW_KEY = 'grovepad:view:v1'
const BOARD_SAVE_MS = 600
const VIEW_SAVE_MS = 800
const DIRTY_KEY = 'grovepad:dirty-exit:v1'

const loadCloudSync = () => import('./cloudSync')

interface PersistedView {
  pan: Vector2D
  zoom: number
}

interface PersistenceWidgetState extends PersistedBoard {
  loadBoard: (board: PersistedBoard) => void
}

interface PersistenceCanvasState {
  pan: Vector2D
  zoom: number
  isPanning: boolean
  setView: (pan: Vector2D, zoom: number) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isVector(value: unknown): value is Vector2D {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

// ---------------------------------------------------------------------------
// Validation — a corrupt or hand-edited payload must never crash the app.
// Anything that fails a shape check is dropped; the rest of the board loads.
// ---------------------------------------------------------------------------

function readJson(key: string): unknown {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Load the persisted board, or null when nothing valid was saved yet (first
 * visit, cleared storage, or unparseable payload) — the caller seeds then.
 * An empty-but-valid board is honored: deleting everything must stick.
 */
export function loadPersistedBoard(): PersistedBoard | null {
  const v2 = parsePersistedBoard(readJson(BOARD_KEY))
  if (v2) return v2
  return migrateLegacyBoard(readJson(BOARD_KEY_V1))
}

function loadPersistedView(): PersistedView | null {
  const parsed = readJson(VIEW_KEY)
  if (!isRecord(parsed) || !isVector(parsed.pan) || !isFiniteNumber(parsed.zoom)) return null
  return { pan: parsed.pan, zoom: clampZoom(parsed.zoom) }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable — the app keeps working in-memory.
  }
}

// ---------------------------------------------------------------------------
// Store wiring
// ---------------------------------------------------------------------------

interface DebouncedSaver {
  schedule: () => void
  flush: () => void
}

function debouncedSaver(delayMs: number, save: () => void): DebouncedSaver {
  let timer: number | null = null
  let idleHandle: number | null = null
  let pending = false
  const idleApi = window as unknown as {
    requestIdleCallback?: Window['requestIdleCallback']
    cancelIdleCallback?: Window['cancelIdleCallback']
  }

  const cancelScheduled = () => {
    if (timer !== null) window.clearTimeout(timer)
    if (idleHandle !== null && idleApi.cancelIdleCallback) {
      idleApi.cancelIdleCallback(idleHandle)
    }
    timer = null
    idleHandle = null
  }

  const run = () => {
    if (!pending) return
    pending = false
    timer = null
    idleHandle = null
    save()
  }

  return {
    schedule: () => {
      pending = true
      cancelScheduled()
      timer = window.setTimeout(() => {
        timer = null
        // Large boards can make JSON serialization noticeable. Prefer the
        // browser's idle window, with a timeout so persistence still has a
        // deterministic upper bound during sustained interaction.
        if (idleApi.requestIdleCallback) {
          idleHandle = idleApi.requestIdleCallback(run, { timeout: 1200 })
        } else {
          timer = window.setTimeout(run, 0)
        }
      }, delayMs)
    },
    flush: () => {
      if (!pending) return
      cancelScheduled()
      run()
    },
  }
}

/**
 * Restore the saved camera and start persisting both stores. Call once at
 * startup, before the first render.
 */
export function buildBoardSnapshot(state: PersistedBoard): PersistedBoard {
  return {
    workspaces: state.workspaces,
    canvases: state.canvases,
    widgets: state.widgets,
    relations: state.relations,
    connections: state.connections,
    groups: state.groups,
    activePacks: state.activePacks,
    activeWorkspaceId: state.activeWorkspaceId,
    activeCanvasId: state.activeCanvasId,
    canvasViews: state.canvasViews,
  }
}

let conflictResolver: ((choice: 'local' | 'cloud') => void) | null = null

export function resolveCloudConflict(choice: 'local' | 'cloud'): void {
  conflictResolver?.(choice)
  conflictResolver = null
  usePersistenceStatusStore.getState().setConflict(null)
}

export function initPersistence<
  WidgetState extends PersistenceWidgetState,
  CanvasState extends PersistenceCanvasState,
>(
  widgetStore: StoreApi<WidgetState>,
  canvasStore: StoreApi<CanvasState>,
): void {
  const view = loadPersistedView()
  if (view) canvasStore.getState().setView(view.pan, view.zoom)
  try {
    if (localStorage.getItem(DIRTY_KEY)) {
      useToastStore.getState().addToast('The previous session closed before its final save — a local snapshot may help')
    }
  } catch { /* storage unavailable */ }

  const localReady = readBoardDatabase()
    .then(async (raw) => {
      const board = raw ? parsePersistedBoard(raw) : null
      if (board) {
        widgetStore.getState().loadBoard(board)
      } else {
        await writeBoardDatabase(buildBoardSnapshot(widgetStore.getState()))
      }
    })
    .catch(() => undefined)

  // The signed-in user id once cloud reconciliation has resolved for it —
  // null means either signed out/guest, or the fetch for this session
  // hasn't finished yet (debounced saves stay local-only meanwhile, so a
  // fresh sign-in never overwrites a cloud board it hasn't seen yet).
  let cloudUserId: string | null = null

  let storageToastShown = false
  let lastSnapshotAt = 0
  const boardSaver = debouncedSaver(BOARD_SAVE_MS, () => {
    const board = buildBoardSnapshot(widgetStore.getState())
    usePersistenceStatusStore.getState().setLocalSave('saving')
    void writeBoardDatabase(board)
      .then(() => {
        usePersistenceStatusStore.getState().setLocalSave('saved')
        try { localStorage.removeItem(DIRTY_KEY) } catch { /* storage unavailable */ }
        if (Date.now() - lastSnapshotAt >= 10 * 60 * 1000) {
          lastSnapshotAt = Date.now()
          void saveRollingSnapshot(board).catch(() => undefined)
        }
      })
      .catch(() => {
        usePersistenceStatusStore.getState().setLocalSave('error')
        if (!storageToastShown) {
          storageToastShown = true
          useToastStore.getState().addToast('Changes are not being saved — export a backup now')
        }
      })
    const userId = cloudUserId
    if (userId) {
      usePersistenceStatusStore.getState().setCloudSync('saving')
      void loadCloudSync()
        .then(({ pushCloudBoard }) => pushCloudBoard(userId, board))
        .then(() => {
          usePersistenceStatusStore.getState().setCloudSync('synced')
          usePersistenceStatusStore.getState().setLastSyncedAt(Date.now())
        })
        .catch(() => usePersistenceStatusStore.getState().setCloudSync('error'))
    }
  })

  // ── Cloud sync: reconcile whenever the auth session changes ──────────────
  if (supabaseConfigured) {
    let reconcileToken = 0
    const reconcile = async (userId: string | null) => {
      const token = ++reconcileToken
      cloudUserId = null
      if (!userId) {
        usePersistenceStatusStore.getState().setCloudSync('guest')
        return
      }
      usePersistenceStatusStore.getState().setCloudSync('saving')
      try {
        await localReady
        const { fetchCloudBoard, pushCloudBoard } = await loadCloudSync()
        const cloudResult = await fetchCloudBoard(userId)
        if (token !== reconcileToken) return // a newer session superseded this fetch
        if (cloudResult) {
          const local = buildBoardSnapshot(widgetStore.getState())
          const cloud = cloudResult.board
          const differs = JSON.stringify(local) !== JSON.stringify(cloud)
          if (Object.keys(local.widgets).length > 0 && differs) {
            usePersistenceStatusStore.getState().setConflict({
              local,
              cloud,
              cloudUpdatedAt: cloudResult.updatedAt,
            })
            const choice = await new Promise<'local' | 'cloud'>((resolve) => {
              conflictResolver = resolve
            })
            if (token !== reconcileToken) return
            if (choice === 'cloud') widgetStore.getState().loadBoard(cloud)
            else await pushCloudBoard(userId, local)
          } else {
            widgetStore.getState().loadBoard(cloud)
          }
        } else {
          // First sign-in on this account — seed the cloud with whatever's local
          // (including guest work made before signing in).
          await pushCloudBoard(userId, buildBoardSnapshot(widgetStore.getState()))
        }
        cloudUserId = userId
        usePersistenceStatusStore.getState().setCloudSync('synced')
        usePersistenceStatusStore.getState().setLastSyncedAt(Date.now())
      } catch {
        // Cloud code is optional. Local persistence remains the source of truth
        // if its chunk cannot load or the network/client is unavailable.
        usePersistenceStatusStore.getState().setCloudSync('error')
      }
    }

    let lastUserId = useAuthStore.getState().session?.user.id ?? null
    void reconcile(lastUserId)
    useAuthStore.subscribe((state) => {
      const userId = state.session?.user.id ?? null
      if (userId === lastUserId) return
      lastUserId = userId
      void reconcile(userId)
    })
  }

  const viewSaver = debouncedSaver(VIEW_SAVE_MS, () => {
    const { pan, zoom } = canvasStore.getState()
    writeStorage(VIEW_KEY, { pan, zoom })
  })

  let gestureDirty = false
  widgetStore.subscribe((state, prev) => {
    if (
      state.widgets === prev.widgets &&
      state.relations === prev.relations &&
      state.connections === prev.connections &&
      state.groups === prev.groups &&
      state.activePacks === prev.activePacks &&
      state.workspaces === prev.workspaces &&
      state.canvases === prev.canvases &&
      state.activeWorkspaceId === prev.activeWorkspaceId &&
      state.activeCanvasId === prev.activeCanvasId &&
      state.canvasViews === prev.canvasViews
    ) {
      return
    }
    try { localStorage.setItem(DIRTY_KEY, String(Date.now())) } catch { /* storage unavailable */ }
    // Pointer gestures already commit canonical state on release. Avoid
    // cancel/recreating persistence timers for every high-frequency drag or
    // resize frame; schedule one trailing save when the gesture ends.
    if (document.body.hasAttribute('data-widget-dragging')) {
      gestureDirty = true
      return
    }
    boardSaver.schedule()
  })

  const scheduleGestureSave = () => {
    if (!gestureDirty) return
    gestureDirty = false
    boardSaver.schedule()
  }
  window.addEventListener('pointerup', scheduleGestureSave, true)
  window.addEventListener('pointercancel', scheduleGestureSave, true)

  let viewGestureDirty = false
  canvasStore.subscribe((state, prev) => {
    const cameraChanged = state.pan !== prev.pan || state.zoom !== prev.zoom
    if (state.isPanning && cameraChanged) {
      viewGestureDirty = true
      return
    }
    if (!state.isPanning && prev.isPanning && viewGestureDirty) {
      viewGestureDirty = false
      viewSaver.schedule()
      return
    }
    if (!cameraChanged) return
    viewSaver.schedule()
  })

  const flushAll = () => {
    if (gestureDirty) {
      gestureDirty = false
      boardSaver.schedule()
    }
    if (viewGestureDirty) {
      viewGestureDirty = false
      viewSaver.schedule()
    }
    boardSaver.flush()
    viewSaver.flush()
  }
  window.addEventListener('pagehide', flushAll)
  window.addEventListener('beforeunload', (event) => {
    if (!gestureDirty && usePersistenceStatusStore.getState().localSave !== 'saving') return
    event.preventDefault()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll()
  })
}
