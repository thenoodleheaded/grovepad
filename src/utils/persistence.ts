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
  remapLegacyRootCanvasId,
  serializePersistedBoard,
} from './persistedBoardSchema'
import {
  resolvePersistedDeviceState,
  serializePersistedDeviceState,
} from './persistedDeviceState'
import { canonicalJson } from './cloudDocuments'
import { mergeBoardsThreeWay } from './boardThreeWayMerge'
import {
  fingerprintBoard,
  fingerprintsMatch,
  readSyncBaseline,
  writeSyncBaseline,
  type BoardFingerprint,
} from './syncBaseline'

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
// Cloud sync cadence — sync is opt-in (usePersistenceStatusStore.syncEnabled)
// and, when on, keeps this device and the account in step continuously rather
// than once a day.
//
// The old daily reconcile is what made the conflict prompt inevitable: a
// board edited all day and uploaded once a day is guaranteed to differ from
// the cloud at the next check, and with nothing recording what the two sides
// last agreed on, "you edited here" was indistinguishable from "somebody
// edited there". Syncing often removes the drift; the baseline in
// syncBaseline.ts removes the ambiguity in whatever drift is left.
//
// Frequent is not expensive here. A check reads two small checksum columns
// (fetchCloudHead) and stops there when nothing moved; an upload re-sends only
// the canvases whose checksums changed. Debounced local saves still never
// touch the network — the push below is its own idle timer.
// ---------------------------------------------------------------------------

const SYNC_STAMP_PREFIX = 'grovepad:cloud-sync:last:'
/** Floor between automatic checks. Focus changes and idle edits both land here. */
const CLOUD_CHECK_INTERVAL_MS = 5 * 60 * 1000
/** Quiet time after the last board edit before this device uploads. */
const CLOUD_PUSH_IDLE_MS = 20_000

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

const loadCloudSync = () => import('./cloudSync')

interface PersistedView {
  pan: Vector2D
  zoom: number
}

interface PersistenceWidgetState extends PersistedBoardState, BoardDeviceState {
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
  // Boards written before canvas ids were minted per install all call their root
  // canvas the same thing, and that id is a cloud primary key. Move off it here,
  // where every load funnels through, so no other layer has to know about it.
  if (v2) return remapLegacyRootCanvasId(v2)
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

let activePersistenceDispose: (() => void) | null = null
let runtimeSyncTrigger: ((force: boolean) => void) | null = null
/**
 * Settles once the startup IndexedDB read has settled: after loadBoard has
 * hydrated the store for a returning user, after the seed write attempt on a
 * proven-empty disk, or after the write-block latch on a failed read. Already
 * resolved when persistence never started (unit tests, guest shells), and it
 * never rejects. Deliberately NOT reset on dispose: between dispose and the
 * next init, "settled" is the correct answer — no further hydration is coming.
 */
let localBoardHydration: Promise<void> = Promise.resolve()

/**
 * The store seeds synchronously at module scope and hydrates later from
 * IndexedDB. Anything that diffs or publishes board state (collaboration
 * session start) must wait for this seam, or it reads the seed/stale board —
 * and a live shared doc diffed against that copy publishes deletions of
 * collaborators' work.
 */
export function whenLocalBoardHydrated(): Promise<void> {
  return localBoardHydration
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
  // Set only once the read has come back and PROVED the record absent. It is
  // what separates "we never learned what is on disk" from "there is nothing
  // on disk to protect", which the shared catch below cannot otherwise tell
  // apart — the seed write it also covers lives inside the same `.then`.
  let diskProvenEmpty = false
  // Bumped by every document-changing store update. reconcile() snapshots it
  // alongside the board so it can tell, after its network round trip, whether
  // the user edited the document while the fetch was in the air — adopting or
  // merging onto a stale snapshot would silently drop those edits.
  let documentEpoch = 0
  let scheduleCloudPush: (() => void) | null = null
  let cancelCloudPush: (() => void) | null = null
  const view = loadPersistedView()
  if (view) canvasStore.getState().setView(view.pan, view.zoom)
  try {
    if (localStorage.getItem(DIRTY_KEY)) {
      useToastStore.getState().addToast('The previous session closed before its final save — a local snapshot may help', { tone: 'danger' })
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
          useToastStore.getState().addToast('This board needs a newer Grovepad — saving is disabled to protect it', { tone: 'danger' })
        }
        return
      }
      if (disposed) return
      const board = raw ? parsePersistedBoard(raw) : null
      if (board) {
        widgetStore.getState().loadBoard(board, { restorePersistedDeviceState: true })
      } else if (!localWritesBlocked) {
        diskProvenEmpty = true
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
      // The seed write lives inside the `.then` above, so it lands here too.
      // That one case is safe to let through: the read succeeded and proved
      // the record absent, so there is nothing to overwrite and the debounced
      // saver retries it like any other write failure.
      if (diskProvenEmpty) return
      // Never let a later debounced save bypass the source-snapshot contract
      // after an IndexedDB read or atomic migration transaction fails. This
      // used to return early unless a legacy migration was pending, which is
      // never true on a modern install — so an ordinary failed read was
      // swallowed, and the blank board shell created at module scope was
      // written over the user's real record on their very first edit.
      localWritesBlocked = true
      if (!disposed) {
        usePersistenceStatusStore.getState().setLocalSave('error')
        useToastStore.getState().addToast(
          pendingLegacyMigrationSource !== null
            ? 'Legacy board migration could not be protected — saving is paused; export a backup now'
            // Not "export a backup": the store is holding the blank board
            // shell at this point, so an export here would not contain the
            // record we failed to read.
            : 'Your saved board could not be opened — saving is paused so it is not overwritten. Reload to try again.',
          { tone: 'danger' },
        )
      }
    })

  // Never rejects even if a future edit changes the catch above: collaboration
  // awaits this seam before starting sessions, and a rejection there would be
  // an unhandled break of session start rather than a hydration signal.
  localBoardHydration = localReady.then(() => undefined, () => undefined)

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
            useToastStore.getState().addToast('Changes are not being saved — export a backup now', { tone: 'danger' })
          }
        })
      // Cloud writes are deliberately absent here: sync is quota-gated in
      // reconcile() below, never coupled to the local save cadence.
    })
  })

  // ── Cloud sync: opt-in, reconciled against the last-synced baseline ───────
  if (supabaseConfigured) {
    let reconcileToken = 0
    let lastCheckAt = 0
    invalidateReconcile = () => { reconcileToken += 1 }

    const markSynced = (at: number) => {
      usePersistenceStatusStore.getState().setCloudSync('synced')
      usePersistenceStatusStore.getState().setLastSyncedAt(at)
    }

    /** Record what both sides now agree on, so the next merge has lineage. */
    const rememberBaseline = async (
      userId: string,
      board: PersistedBoard,
      print: BoardFingerprint,
      cloudUpdatedAt: string | null,
    ) => {
      await writeSyncBaseline({ userId, board, ...print, cloudUpdatedAt, at: Date.now() })
    }

    const reconcile = async (userId: string | null, force = false) => {
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
      const startedAt = Date.now()
      if (!force && startedAt - lastCheckAt < CLOUD_CHECK_INTERVAL_MS) {
        // Checked moments ago. Say so from the stamp rather than re-asking the
        // network every time the window regains focus.
        status.setCloudSync('synced')
        if (status.lastSyncedAt === null) status.setLastSyncedAt(lastSyncStamp(userId))
        return
      }
      lastCheckAt = startedAt
      usePersistenceStatusStore.getState().setCloudSync('saving')
      try {
        await localReady
        // A board we refuse to write to disk must not reach the cloud either.
        // pushCloudBoard DELETES remote canvas rows absent from what it is
        // handed, so pushing the blank local shell over a real cloud record
        // destroys more than the local overwrite would.
        if (localWritesBlocked) {
          usePersistenceStatusStore.getState().setCloudSync('error')
          return
        }
        const local = buildBoardSnapshot(widgetStore.getState())
        const localEpoch = documentEpoch
        const [baseline, localPrint] = await Promise.all([
          readSyncBaseline(userId),
          fingerprintBoard(local),
        ])
        if (disposed || token !== reconcileToken) return
        const { fetchCloudBoard, fetchCloudHead, pushCloudBoard } = await loadCloudSync()

        // Step one is deliberately not a board fetch. The cloud already stores
        // the same checksums fingerprintBoard computes, so two small metadata
        // reads settle most reconciles with no board crossing the network in
        // either direction.
        const head = await fetchCloudHead(userId)
        if (disposed || token !== reconcileToken) return

        const settle = async (
          board: PersistedBoard,
          print: BoardFingerprint,
          cloudUpdatedAt: string | null,
        ) => {
          const syncedAt = Date.now()
          writeSyncStamp(userId, syncedAt)
          await rememberBaseline(userId, board, print, cloudUpdatedAt)
          if (disposed || token !== reconcileToken) return
          markSynced(syncedAt)
        }

        if (head === null) {
          // No cloud board yet — first sign-in on this account. Seed it with
          // whatever is here, including work done as a guest beforehand.
          await pushCloudBoard(userId, local)
          if (disposed || token !== reconcileToken) return
          await settle(local, localPrint, null)
          return
        }

        if (head !== 'inconclusive') {
          const cloudPrint: BoardFingerprint = {
            indexChecksum: head.indexChecksum,
            canvasChecksums: Object.fromEntries(head.canvasChecksums),
          }
          // Already identical, whatever the baseline says. Nothing to transfer,
          // and the lineage can be re-established for free.
          if (fingerprintsMatch(localPrint, cloudPrint)) {
            await settle(local, localPrint, head.updatedAt)
            return
          }
          // Only this device moved: a plain upload, never a question. This is
          // the case the old byte-comparison could not tell from a conflict,
          // and it is by far the most common one.
          if (baseline && fingerprintsMatch(cloudPrint, baseline)) {
            await pushCloudBoard(userId, local)
            if (disposed || token !== reconcileToken) return
            await settle(local, localPrint, null)
            return
          }
        }

        // The cloud moved (or the cheap check could not be trusted). Only now
        // is a full fetch worth its bytes.
        const cloudResult = await fetchCloudBoard(userId)
        if (disposed || token !== reconcileToken) return
        // Everything past here — the adopt branch and the three-way merge —
        // derives from `local`, snapshotted before the round trip. If the
        // document moved meanwhile, that snapshot is stale and loading from it
        // would discard the edit; the edit already scheduled a cloud push, so
        // the next reconcile starts from a fresh snapshot.
        if (documentEpoch !== localEpoch) return
        if (!cloudResult) {
          await pushCloudBoard(userId, local)
          if (disposed || token !== reconcileToken) return
          await settle(local, localPrint, null)
          return
        }
        const cloudSnapshot = serializePersistedBoard(cloudResult.board)

        // Only the cloud moved, or there is nothing here worth protecting:
        // adopt the account's board outright.
        const localUnchanged = baseline !== null && fingerprintsMatch(localPrint, baseline)
        if (localUnchanged || Object.keys(local.widgets).length === 0) {
          widgetStore.getState().loadBoard(cloudResult.board)
          const cloudPrint = await fingerprintBoard(cloudSnapshot)
          if (disposed || token !== reconcileToken) return
          // A board still living in the retained monolithic row is rewritten
          // as split documents on the way past.
          if (cloudResult.source === 'legacy') await pushCloudBoard(userId, cloudSnapshot)
          if (disposed || token !== reconcileToken) return
          await settle(cloudSnapshot, cloudPrint, cloudResult.updatedAt)
          return
        }

        // Both sides moved. The baseline says which side moved each record, so
        // this resolves without asking; see boardThreeWayMerge.ts.
        const merge = mergeBoardsThreeWay(baseline?.board ?? null, local, cloudSnapshot)
        const current = widgetStore.getState()
        const hydrated = parsePersistedBoard({
          ...merge.board,
          activeWorkspaceId: current.activeWorkspaceId,
          activeCanvasId: current.activeCanvasId,
          canvasViews: current.canvasViews,
        })
        if (!hydrated) throw new Error('Merged board failed validation')
        // Re-serialized rather than pushed straight from the merge, so the
        // document that lands in the cloud is exactly the one the store holds.
        const mergedSnapshot = serializePersistedBoard(hydrated)
        const mergedJson = canonicalJson(mergedSnapshot)
        if (mergedJson !== canonicalJson(local)) widgetStore.getState().loadBoard(hydrated)
        const mergedPrint = await fingerprintBoard(mergedSnapshot)
        if (disposed || token !== reconcileToken) return
        if (mergedJson !== canonicalJson(cloudSnapshot) || cloudResult.source === 'legacy') {
          await pushCloudBoard(userId, mergedSnapshot)
        }
        if (disposed || token !== reconcileToken) return
        await settle(mergedSnapshot, mergedPrint, null)
        if (merge.keptBothTitles.length > 0) {
          const count = merge.keptBothTitles.length
          useToastStore.getState().addToast(
            count === 1
              ? `"${merge.keptBothTitles[0]}" was edited in two places — both versions are on the canvas`
              : `${count} cards were edited in two places — both versions of each are on the canvas`,
          )
        }
      } catch (error) {
        // Cloud code is optional. Local persistence remains the source of truth
        // if its chunk cannot load or the network/client is unavailable.
        if (!disposed) {
          const status = usePersistenceStatusStore.getState()
          const wasError = status.cloudSync === 'error'
          status.setCloudSync('error')
          if (error instanceof FuturePersistedBoardVersionError) {
            usePersistenceStatusStore.getState().setCompatibilityBlock({
              foundVersion: error.foundVersion,
              source: 'cloud',
            })
          } else if (!wasError && status.networkOnline) {
            // Say it once, on the transition into failure — a recolored dot in
            // the corner is not enough notice that sync stopped. Offline is
            // not an error (the status line already says "Offline"), and a
            // future-version block has its own full-screen explanation.
            useToastStore.getState().addToast(
              'Cloud sync hit a problem — your changes are safe on this device',
              { tone: 'danger' },
            )
          }
        }
      }
    }

    let lastUserId = useAuthStore.getState().session?.user.id ?? null
    void reconcile(lastUserId, true)
    unsubscribeAuth = useAuthStore.subscribe((state) => {
      const userId = state.session?.user.id ?? null
      if (userId === lastUserId) return
      lastUserId = userId
      // The throttle is per account: a fresh sign-in always checks.
      lastCheckAt = 0
      void reconcile(userId, true)
    })

    // "Sync now" — bypasses the check interval for the current session user.
    runtimeSyncTrigger = (force) => { void reconcile(lastUserId, force) }

    // Uploading shortly after the edits stop is what keeps the two sides from
    // drifting far enough apart to need a merge at all.
    const cloudPushSaver = debouncedSaver(CLOUD_PUSH_IDLE_MS, () => {
      void reconcile(lastUserId, true)
    })
    scheduleCloudPush = () => cloudPushSaver.schedule()
    cancelCloudPush = () => cloudPushSaver.cancel()

    // Enabling the toggle syncs immediately (that click is explicit intent);
    // disabling stops all cloud traffic until it is turned back on.
    let lastSyncEnabled = usePersistenceStatusStore.getState().syncEnabled
    unsubscribeSyncPref = usePersistenceStatusStore.subscribe((state) => {
      if (state.syncEnabled === lastSyncEnabled) return
      lastSyncEnabled = state.syncEnabled
      if (!state.syncEnabled) cloudPushSaver.cancel()
      void reconcile(lastUserId, state.syncEnabled)
    })

    // Returning to the tab counts as getting active, throttled by
    // CLOUD_CHECK_INTERVAL_MS inside reconcile().
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
    // Same rule as the board: with the read failed, the device state in memory
    // is the seed's, not the user's, so scheduling this would overwrite their
    // saved canvas/camera position while saving is supposedly paused.
    if (!disposed && !localWritesBlocked) deviceSaver.schedule()
  })

  let gestureDirty = false
  const unsubscribeWidget = widgetStore.subscribe((state, prev) => {
    const documentChanged = !(
      state.widgets === prev.widgets &&
      state.relations === prev.relations &&
      state.connections === prev.connections &&
      state.glues === prev.glues &&
      state.activePacks === prev.activePacks &&
      state.workspaces === prev.workspaces &&
      state.canvases === prev.canvases &&
      state.persistenceUnknownFields === prev.persistenceUnknownFields &&
      state.persistenceUnknownRelations === prev.persistenceUnknownRelations &&
      state.persistenceUnknownConnections === prev.persistenceUnknownConnections &&
      state.persistenceUnknownGlues === prev.persistenceUnknownGlues &&
      state.persistenceRawActivePacks === prev.persistenceRawActivePacks
    )
    const deviceChanged =
      state.activeWorkspaceId !== prev.activeWorkspaceId ||
      state.activeCanvasId !== prev.activeCanvasId ||
      state.canvasViews !== prev.canvasViews ||
      state.openTabs !== prev.openTabs ||
      state.activeTabId !== prev.activeTabId
    if (!documentChanged && !deviceChanged) return
    if (deviceChanged) deviceSaver.schedule()
    if (!documentChanged) return
    documentEpoch += 1
    try { localStorage.setItem(DIRTY_KEY, String(Date.now())) } catch { /* storage unavailable */ }
    // Pointer gestures already commit canonical state on release. Avoid
    // cancel/recreating persistence timers for every high-frequency drag or
    // resize frame; schedule one trailing save when the gesture ends.
    if (document.body.hasAttribute('data-widget-dragging')) {
      gestureDirty = true
      return
    }
    boardSaver.schedule()
    // Its own, much longer timer: local saving must never wait on the network,
    // and the cloud must never see a keystroke-by-keystroke stream.
    scheduleCloudPush?.()
  })

  const scheduleGestureSave = () => {
    if (!gestureDirty) return
    gestureDirty = false
    boardSaver.schedule()
    scheduleCloudPush?.()
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
    const { localSave } = usePersistenceStatusStore.getState()
    // 'error' means writes are paused to protect a record we could not read,
    // so nothing from this session has reached disk. Closing without a prompt
    // would lose all of it silently.
    if (!gestureDirty && localSave !== 'saving' && localSave !== 'error') return
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
    cancelCloudPush?.()
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
