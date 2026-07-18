import type { StoreApi } from 'zustand'
import type {
  BoardDeviceState,
  HydratedPersistedBoard,
  PersistedBoard,
  PersistedBoardDocumentState,
  PersistedBoardState,
} from '../types/persistence'
import type { Vector2D } from '../types/spatial'
import { clampZoom } from '../types/spatial'
import { useAuthStore } from '../store/useAuthStore'
import { supabaseConfigured } from '../lib/supabase'
import { usePersistenceStatusStore } from '../store/usePersistenceStatusStore'
import { useToastStore } from '../store/useToastStore'
import {
  readBoardDatabase,
  saveRollingSnapshot,
  writeBoardDatabase,
  writeMigratedBoardDatabase,
} from './boardDatabase'
import {
  FuturePersistedBoardVersionError,
  getFuturePersistedBoardVersion,
  migrateLegacyBoard,
  parsePersistedBoard,
  serializePersistedBoard,
} from './persistedBoardSchema'
import {
  resolvePersistedDeviceState,
  serializePersistedDeviceState,
} from './persistedDeviceState'
import { canonicalJson } from './cloudDocuments'
import { mergePersistedBoardWorkspaces } from './boardWorkspaceMerge'

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
const DEVICE_KEY = 'grovepad:device:v1'
const VIEW_KEY = 'grovepad:view:v1'
const BOARD_SAVE_MS = 600
const DEVICE_SAVE_MS = 300
const VIEW_SAVE_MS = 800
const DIRTY_KEY = 'grovepad:dirty-exit:v1'
let futureVersionWriteLock = false
let pendingLegacyMigrationSource: unknown = null

// ---------------------------------------------------------------------------
// Cloud sync quota — sync is opt-in (usePersistenceStatusStore.syncEnabled)
// and, when on, reconciles with Supabase at most once per day automatically.
// A successful reconcile stamps localStorage per user; "Sync now" bypasses
// the quota. Debounced saves never touch the network.
// ---------------------------------------------------------------------------

const SYNC_STAMP_PREFIX = 'grovepad:cloud-sync:last:'
const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000

function lastSyncStamp(userId: string): number | null {
  try {
    const raw = localStorage.getItem(SYNC_STAMP_PREFIX + userId)
    const at = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(at) ? at : null
  } catch {
    return null
  }
}

function writeSyncStamp(userId: string, at: number): void {
  try {
    localStorage.setItem(SYNC_STAMP_PREFIX + userId, String(at))
  } catch {
    // Storage unavailable — the next activity check may sync again early.
  }
}

/** True when the daily automatic sync window has elapsed for this user. */
function isAutoSyncDue(lastAt: number | null, now: number): boolean {
  return lastAt === null || now - lastAt >= AUTO_SYNC_INTERVAL_MS
}

const loadCloudSync = () => import('./cloudSync')

interface PersistedView {
  pan: Vector2D
  zoom: number
}

interface PersistenceWidgetState extends PersistedBoardState {
  loadBoard: (
    board: HydratedPersistedBoard,
    options?: { restorePersistedDeviceState?: boolean },
  ) => void
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
export function loadPersistedBoard(): HydratedPersistedBoard | null {
  const raw = readJson(BOARD_KEY)
  const futureVersion = getFuturePersistedBoardVersion(raw)
  if (futureVersion !== null) {
    futureVersionWriteLock = true
    usePersistenceStatusStore.getState().setCompatibilityBlock({
      foundVersion: futureVersion,
      source: 'local',
    })
  }
  const v2 = parsePersistedBoard(raw)
  if (v2) return v2
  const legacy = readJson(BOARD_KEY_V1)
  const migrated = migrateLegacyBoard(legacy)
  if (migrated) {
    pendingLegacyMigrationSource = legacy
  }
  return migrated
}

/** Load local-only navigation, migrating the former embedded v2 fields once. */
export function loadPersistedDeviceState(
  board: Pick<PersistedBoardDocumentState, 'workspaces' | 'canvases'>,
  legacyFallback?: Partial<BoardDeviceState>,
): BoardDeviceState {
  const raw = readJson(DEVICE_KEY)
  return resolvePersistedDeviceState(raw, board, legacyFallback)
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
  cancel: () => void
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
    cancel: () => {
      pending = false
      cancelScheduled()
    },
  }
}

/**
 * Restore the saved camera and start persisting both stores. Call once at
 * startup, before the first render.
 */
export function buildBoardSnapshot(state: PersistedBoardState): PersistedBoard {
  return serializePersistedBoard(state)
}

type CloudConflictChoice = 'local' | 'cloud' | 'merge'

let conflictResolver: ((choice: CloudConflictChoice) => void) | null = null
let activePersistenceDispose: (() => void) | null = null
let runtimeSyncTrigger: ((force: boolean) => void) | null = null

export function resolveCloudConflict(choice: CloudConflictChoice): void {
  conflictResolver?.(choice)
  conflictResolver = null
  usePersistenceStatusStore.getState().setConflict(null)
}

/** Run a cloud reconcile now (the "Sync now" button). No-op for guests or
 * when persistence/cloud is not initialized. */
export function requestCloudSync(): void {
  runtimeSyncTrigger?.(true)
}

export function initPersistence<
  WidgetState extends PersistenceWidgetState,
  CanvasState extends PersistenceCanvasState,
>(
  widgetStore: StoreApi<WidgetState>,
  canvasStore: StoreApi<CanvasState>,
): () => void {
  if (activePersistenceDispose) return activePersistenceDispose
  let disposed = false
  let invalidateReconcile = () => {}
  let unsubscribeAuth: (() => void) | null = null
  let unsubscribeSyncPref: (() => void) | null = null
  let syncWhenActive: (() => void) | null = null
  let localWritesBlocked = futureVersionWriteLock
  let runtimeConflictResolver: ((choice: CloudConflictChoice) => void) | null = null
  const view = loadPersistedView()
  if (view) canvasStore.getState().setView(view.pan, view.zoom)
  try {
    if (localStorage.getItem(DIRTY_KEY)) {
      useToastStore.getState().addToast('The previous session closed before its final save — a local snapshot may help')
    }
  } catch { /* storage unavailable */ }

  const localReady = readBoardDatabase()
    .then(async (raw) => {
      const futureVersion = getFuturePersistedBoardVersion(raw)
      if (futureVersion !== null) {
        localWritesBlocked = true
        if (!disposed) {
          usePersistenceStatusStore.getState().setLocalSave('error')
          usePersistenceStatusStore.getState().setCompatibilityBlock({
            foundVersion: futureVersion,
            source: 'local',
          })
          useToastStore.getState().addToast('This board needs a newer Grovepad — saving is disabled to protect it')
        }
        return
      }
      if (disposed) return
      const board = raw ? parsePersistedBoard(raw) : null
      if (board) {
        widgetStore.getState().loadBoard(board, { restorePersistedDeviceState: true })
      } else if (!localWritesBlocked) {
        const initialBoard = buildBoardSnapshot(widgetStore.getState())
        if (pendingLegacyMigrationSource !== null) {
          await writeMigratedBoardDatabase(pendingLegacyMigrationSource, 1, initialBoard)
          pendingLegacyMigrationSource = null
        } else {
          await writeBoardDatabase(initialBoard)
        }
      }
    })
    .catch(() => {
      if (pendingLegacyMigrationSource === null) return
      // Never let a later debounced save bypass the source-snapshot contract
      // after an IndexedDB read or atomic migration transaction fails.
      localWritesBlocked = true
      if (!disposed) {
        usePersistenceStatusStore.getState().setLocalSave('error')
        useToastStore.getState().addToast(
          'Legacy board migration could not be protected — saving is paused; export a backup now',
        )
      }
    })

  let storageToastShown = false
  let lastSnapshotAt = 0
  const boardSaver = debouncedSaver(BOARD_SAVE_MS, () => {
    // Resolve the initial IndexedDB read before any write. Otherwise a slow
    // read of a future-version document could race a debounced seed/save.
    void localReady.then(() => {
      if (localWritesBlocked) {
        usePersistenceStatusStore.getState().setLocalSave('error')
        return
      }
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
      // Cloud writes are deliberately absent here: sync is quota-gated in
      // reconcile() below, never coupled to the local save cadence.
    })
  })

  // ── Cloud sync: opt-in, reconciled on sign-in/activity under a daily quota ─
  if (supabaseConfigured) {
    let reconcileToken = 0
    invalidateReconcile = () => { reconcileToken += 1 }
    const reconcile = async (userId: string | null, force = false) => {
      // A visible conflict owns the reconcile pipeline until the user chooses.
      // Starting another visibility/manual sync here would invalidate the
      // awaiting token and replace its resolver, leaving a misleading dialog.
      if (runtimeConflictResolver !== null) return
      const token = ++reconcileToken
      const status = usePersistenceStatusStore.getState()
      if (!status.syncEnabled) {
        status.setCloudSync('off')
        return
      }
      if (!userId) {
        status.setCloudSync('guest')
        return
      }
      const stamp = lastSyncStamp(userId)
      if (!force && !isAutoSyncDue(stamp, Date.now())) {
        // Synced within the last day — trust the stamp, skip the network.
        status.setCloudSync('synced')
        status.setLastSyncedAt(stamp)
        return
      }
      usePersistenceStatusStore.getState().setCloudSync('saving')
      try {
        await localReady
        const { fetchCloudBoard, pushCloudBoard } = await loadCloudSync()
        const cloudResult = await fetchCloudBoard(userId)
        if (disposed || token !== reconcileToken) return // a newer session superseded this fetch
        if (cloudResult) {
          const local = buildBoardSnapshot(widgetStore.getState())
          const cloud = cloudResult.board
          const cloudSnapshot = serializePersistedBoard(cloud)
          const differs = canonicalJson(local) !== canonicalJson(cloudSnapshot)
          if (Object.keys(local.widgets).length > 0 && differs) {
            usePersistenceStatusStore.getState().setConflict({
              local,
              cloud,
              cloudUpdatedAt: cloudResult.updatedAt,
            })
            let resolveThisConflict: (choice: CloudConflictChoice) => void = () => {}
            const choice = await new Promise<CloudConflictChoice>((resolve) => {
              resolveThisConflict = resolve
              runtimeConflictResolver = resolveThisConflict
              conflictResolver = resolveThisConflict
            })
            if (conflictResolver === resolveThisConflict) conflictResolver = null
            if (runtimeConflictResolver === resolveThisConflict) runtimeConflictResolver = null
            if (disposed || token !== reconcileToken) return
            if (choice === 'cloud') {
              widgetStore.getState().loadBoard(cloud)
              if (cloudResult.source === 'legacy') {
                await pushCloudBoard(userId, cloudSnapshot)
              }
            } else if (choice === 'merge') {
              const current = widgetStore.getState()
              const mergedSnapshot = mergePersistedBoardWorkspaces(cloudSnapshot, local, {
                incomingLabel: 'Local',
              })
              const merged = parsePersistedBoard({
                ...mergedSnapshot,
                activeWorkspaceId: current.activeWorkspaceId,
                activeCanvasId: current.activeCanvasId,
                canvasViews: current.canvasViews,
              })
              if (!merged) throw new Error('Merged board failed validation')
              widgetStore.getState().loadBoard(merged)
              await pushCloudBoard(userId, mergedSnapshot)
            } else {
              await pushCloudBoard(userId, local)
            }
          } else {
            widgetStore.getState().loadBoard(cloud)
            if (cloudResult.source === 'legacy') {
              await pushCloudBoard(userId, cloudSnapshot)
            }
          }
        } else {
          // First sign-in on this account — seed the cloud with whatever's local
          // (including guest work made before signing in).
          await pushCloudBoard(userId, buildBoardSnapshot(widgetStore.getState()))
        }
        if (disposed || token !== reconcileToken) return
        const syncedAt = Date.now()
        writeSyncStamp(userId, syncedAt)
        usePersistenceStatusStore.getState().setCloudSync('synced')
        usePersistenceStatusStore.getState().setLastSyncedAt(syncedAt)
      } catch (error) {
        // Cloud code is optional. Local persistence remains the source of truth
        // if its chunk cannot load or the network/client is unavailable.
        if (!disposed) {
          usePersistenceStatusStore.getState().setCloudSync('error')
          if (error instanceof FuturePersistedBoardVersionError) {
            usePersistenceStatusStore.getState().setCompatibilityBlock({
              foundVersion: error.foundVersion,
              source: 'cloud',
            })
          }
        }
      }
    }

    let lastUserId = useAuthStore.getState().session?.user.id ?? null
    void reconcile(lastUserId)
    unsubscribeAuth = useAuthStore.subscribe((state) => {
      const userId = state.session?.user.id ?? null
      if (userId === lastUserId) return
      // Cancel a conflict owned by the previous account without writing either
      // side. The invalidated reconcile returns immediately after resolution.
      const pendingConflict = runtimeConflictResolver
      if (pendingConflict) {
        reconcileToken += 1
        runtimeConflictResolver = null
        if (conflictResolver === pendingConflict) conflictResolver = null
        usePersistenceStatusStore.getState().setConflict(null)
        pendingConflict('cloud')
      }
      lastUserId = userId
      void reconcile(userId)
    })

    // "Sync now" — bypasses the daily quota for the current session user.
    runtimeSyncTrigger = (force) => { void reconcile(lastUserId, force) }

    // Enabling the toggle syncs immediately (that click is explicit intent);
    // disabling stops all cloud traffic until it is turned back on.
    let lastSyncEnabled = usePersistenceStatusStore.getState().syncEnabled
    unsubscribeSyncPref = usePersistenceStatusStore.subscribe((state) => {
      if (state.syncEnabled === lastSyncEnabled) return
      lastSyncEnabled = state.syncEnabled
      void reconcile(lastUserId, state.syncEnabled)
    })

    // Returning to the tab counts as "getting active": at most one automatic
    // reconcile per day, enforced by the stamp check inside reconcile().
    syncWhenActive = () => {
      if (document.visibilityState !== 'visible') return
      void reconcile(lastUserId)
    }
    document.addEventListener('visibilitychange', syncWhenActive)
  }

  const viewSaver = debouncedSaver(VIEW_SAVE_MS, () => {
    const { pan, zoom } = canvasStore.getState()
    writeStorage(VIEW_KEY, { pan, zoom })
  })
  const deviceSaver = debouncedSaver(DEVICE_SAVE_MS, () => {
    writeStorage(DEVICE_KEY, serializePersistedDeviceState(widgetStore.getState()))
  })
  void localReady.then(() => {
    if (!disposed) deviceSaver.schedule()
  })

  let gestureDirty = false
  const unsubscribeWidget = widgetStore.subscribe((state, prev) => {
    const documentChanged = !(
      state.widgets === prev.widgets &&
      state.relations === prev.relations &&
      state.connections === prev.connections &&
      state.groups === prev.groups &&
      state.activePacks === prev.activePacks &&
      state.workspaces === prev.workspaces &&
      state.canvases === prev.canvases &&
      state.persistenceUnknownFields === prev.persistenceUnknownFields &&
      state.persistenceUnknownRelations === prev.persistenceUnknownRelations &&
      state.persistenceUnknownConnections === prev.persistenceUnknownConnections &&
      state.persistenceUnknownGroups === prev.persistenceUnknownGroups &&
      state.persistenceRawActivePacks === prev.persistenceRawActivePacks
    )
    const deviceChanged =
      state.activeWorkspaceId !== prev.activeWorkspaceId ||
      state.activeCanvasId !== prev.activeCanvasId ||
      state.canvasViews !== prev.canvasViews
    if (!documentChanged && !deviceChanged) return
    if (deviceChanged) deviceSaver.schedule()
    if (!documentChanged) return
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
  const unsubscribeCanvas = canvasStore.subscribe((state, prev) => {
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
    deviceSaver.flush()
    viewSaver.flush()
  }
  window.addEventListener('pagehide', flushAll)
  const warnBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!gestureDirty && usePersistenceStatusStore.getState().localSave !== 'saving') return
    event.preventDefault()
  }
  const flushWhenHidden = () => {
    if (document.visibilityState === 'hidden') flushAll()
  }
  window.addEventListener('beforeunload', warnBeforeUnload)
  document.addEventListener('visibilitychange', flushWhenHidden)

  const dispose = () => {
    if (disposed) return
    flushAll()
    disposed = true
    invalidateReconcile()
    const pendingConflict = runtimeConflictResolver
    runtimeConflictResolver = null
    if (conflictResolver === pendingConflict) conflictResolver = null
    pendingConflict?.('local')
    usePersistenceStatusStore.getState().setConflict(null)
    runtimeSyncTrigger = null
    unsubscribeAuth?.()
    unsubscribeSyncPref?.()
    if (syncWhenActive) document.removeEventListener('visibilitychange', syncWhenActive)
    unsubscribeWidget()
    unsubscribeCanvas()
    window.removeEventListener('pointerup', scheduleGestureSave, true)
    window.removeEventListener('pointercancel', scheduleGestureSave, true)
    window.removeEventListener('pagehide', flushAll)
    window.removeEventListener('beforeunload', warnBeforeUnload)
    document.removeEventListener('visibilitychange', flushWhenHidden)
    boardSaver.cancel()
    deviceSaver.cancel()
    viewSaver.cancel()
    if (activePersistenceDispose === dispose) activePersistenceDispose = null
  }
  activePersistenceDispose = dispose
  return dispose
}
