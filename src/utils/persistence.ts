import type { StoreApi } from 'zustand'
import type {
  CanvasMeta,
  DomainPack,
  Relation,
  RelationType,
  Vector2D,
  Widget,
  WidgetGroup,
  Workspace,
} from '../types/spatial'
import { clampZoom, DOMAIN_PACKS, GROUP_COLORS, MODULE_TYPES } from '../types/spatial'
import type { Connection } from '../types/circuit'
import { isValidConnectionShape } from '../types/circuit'
import type { CanvasState } from '../store/useCanvasStore'
import type { WidgetStoreState } from '../store/useWidgetStore'
import { useAuthStore } from '../store/useAuthStore'
import { supabaseConfigured } from '../lib/supabase'
import { usePersistenceStatusStore } from '../store/usePersistenceStatusStore'
import { useToastStore } from '../store/useToastStore'
import { readBoardDatabase, saveRollingSnapshot, writeBoardDatabase } from './boardDatabase'

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

export interface PersistedBoard {
  workspaces: Record<string, Workspace>
  canvases: Record<string, CanvasMeta>
  widgets: Record<string, Widget>
  relations: Record<string, Relation>
  /** Circuit wires. Absent in boards saved before the circuit engine — parses to {}. */
  connections: Record<string, Connection>
  groups: Record<string, WidgetGroup>
  activePacks: DomainPack[]
  activeWorkspaceId: string
  activeCanvasId: string
  canvasViews: Record<string, { pan: Vector2D; zoom: number }>
}

interface PersistedView {
  pan: Vector2D
  zoom: number
}

// ---------------------------------------------------------------------------
// Validation — a corrupt or hand-edited payload must never crash the app.
// Anything that fails a shape check is dropped; the rest of the board loads.
// ---------------------------------------------------------------------------

const MODULE_TYPE_SET = new Set<string>(MODULE_TYPES)
const DOMAIN_PACK_SET = new Set<string>(DOMAIN_PACKS)
const GROUP_COLOR_SET = new Set<string>(GROUP_COLORS)
const RELATION_TYPES: readonly RelationType[] = [
  'parent',
  'co-parent',
  'cousin',
  'blocker',
  'conflict',
]
const RELATION_TYPE_SET = new Set<string>(RELATION_TYPES)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isVector(value: unknown): value is Vector2D {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

/** Widget shape check. `requireCanvasId` is false when migrating v1 data. */
function isValidWidget(value: unknown, requireCanvasId: boolean): value is Widget {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    MODULE_TYPE_SET.has(value.type) &&
    typeof value.title === 'string' &&
    (!requireCanvasId || typeof value.canvasId === 'string') &&
    isVector(value.position) &&
    isRecord(value.size) &&
    isFiniteNumber(value.size.width) &&
    isFiniteNumber(value.size.height) &&
    isRecord(value.data) &&
    isRecord(value.metadata) &&
    Array.isArray(value.metadata.badges)
  )
}

function isValidRelation(value: unknown, widgets: Record<string, Widget>): value is Relation {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.fromId === 'string' &&
    typeof value.toId === 'string' &&
    typeof value.type === 'string' &&
    RELATION_TYPE_SET.has(value.type) &&
    typeof value.isResolved === 'boolean' &&
    Boolean(widgets[value.fromId]) &&
    Boolean(widgets[value.toId])
  )
}

function isValidWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.rootCanvasId === 'string' &&
    isFiniteNumber(value.createdAt)
  )
}

function isValidCanvas(value: unknown): value is CanvasMeta {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.workspaceId === 'string' &&
    (value.parentCanvasId === null || typeof value.parentCanvasId === 'string')
  )
}

function sanitizeGroup(value: unknown, widgets: Record<string, Widget>): WidgetGroup | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.color !== 'string' ||
    !GROUP_COLOR_SET.has(value.color) ||
    !Array.isArray(value.widgetIds)
  ) {
    return null
  }
  const widgetIds = value.widgetIds.filter(
    (id): id is string => typeof id === 'string' && Boolean(widgets[id]),
  )
  if (widgetIds.length < 2) return null
  return { id: value.id, label: value.label, widgetIds, color: value.color as WidgetGroup['color'] }
}

function parseRelations(
  raw: unknown,
  widgets: Record<string, Widget>,
): Record<string, Relation> {
  const relations: Record<string, Relation> = {}
  if (isRecord(raw)) {
    for (const [id, relation] of Object.entries(raw)) {
      if (isValidRelation(relation, widgets) && relation.id === id) relations[id] = relation
    }
  }
  return relations
}

function parseConnections(
  raw: unknown,
  widgets: Record<string, Widget>,
): Record<string, Connection> {
  const connections: Record<string, Connection> = {}
  if (isRecord(raw)) {
    for (const [id, connection] of Object.entries(raw)) {
      if (
        isValidConnectionShape(connection) &&
        connection.id === id &&
        Boolean(widgets[connection.fromId]) &&
        Boolean(widgets[connection.toId])
      ) {
        connections[id] = connection
      }
    }
  }
  return connections
}

function parseGroups(raw: unknown, widgets: Record<string, Widget>): Record<string, WidgetGroup> {
  const groups: Record<string, WidgetGroup> = {}
  if (isRecord(raw)) {
    for (const [id, group] of Object.entries(raw)) {
      const sanitized = sanitizeGroup(group, widgets)
      if (sanitized && sanitized.id === id) groups[id] = sanitized
    }
  }
  return groups
}

function parsePacks(raw: unknown): DomainPack[] {
  return Array.isArray(raw)
    ? raw.filter((p): p is DomainPack => typeof p === 'string' && DOMAIN_PACK_SET.has(p))
    : []
}

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

// ---------------------------------------------------------------------------
// v1 → v2 migration
// ---------------------------------------------------------------------------

const MIGRATED_WORKSPACE_ID = 'ws-default'
const MIGRATED_ROOT_CANVAS_ID = 'canvas-origin'

/** Wrap a v1 flat board in a default workspace + root canvas. */
function migrateV1Board(parsed: unknown): PersistedBoard | null {
  if (!isRecord(parsed) || !isRecord(parsed.widgets)) return null

  const widgets: Record<string, Widget> = {}
  for (const [id, widget] of Object.entries(parsed.widgets)) {
    if (isValidWidget(widget, false) && widget.id === id) {
      widgets[id] = { ...widget, canvasId: MIGRATED_ROOT_CANVAS_ID }
    }
  }

  const workspaces: Record<string, Workspace> = {
    [MIGRATED_WORKSPACE_ID]: {
      id: MIGRATED_WORKSPACE_ID,
      name: 'My Workspace',
      rootCanvasId: MIGRATED_ROOT_CANVAS_ID,
      createdAt: Date.now(),
    },
  }
  const canvases: Record<string, CanvasMeta> = {
    [MIGRATED_ROOT_CANVAS_ID]: {
      id: MIGRATED_ROOT_CANVAS_ID,
      name: 'Origin',
      workspaceId: MIGRATED_WORKSPACE_ID,
      parentCanvasId: null,
    },
  }

  return {
    workspaces,
    canvases,
    widgets,
    relations: parseRelations(parsed.relations, widgets),
    connections: {},
    groups: parseGroups(parsed.groups, widgets),
    activePacks: parsePacks(parsed.activePacks),
    activeWorkspaceId: MIGRATED_WORKSPACE_ID,
    activeCanvasId: MIGRATED_ROOT_CANVAS_ID,
    canvasViews: {},
  }
}

// ---------------------------------------------------------------------------
// v2 loader
// ---------------------------------------------------------------------------

function parseV2Board(parsed: unknown): PersistedBoard | null {
  if (!isRecord(parsed) || !isRecord(parsed.widgets)) return null
  if (!isRecord(parsed.workspaces) || !isRecord(parsed.canvases)) return null

  const workspaces: Record<string, Workspace> = {}
  for (const [id, ws] of Object.entries(parsed.workspaces)) {
    if (isValidWorkspace(ws) && ws.id === id) workspaces[id] = ws
  }

  const canvases: Record<string, CanvasMeta> = {}
  for (const [id, canvas] of Object.entries(parsed.canvases)) {
    if (isValidCanvas(canvas) && canvas.id === id && workspaces[canvas.workspaceId]) {
      canvases[id] = canvas
    }
  }
  // Drop canvases whose parent chain is broken (parent must exist).
  for (const canvas of Object.values(canvases)) {
    if (canvas.parentCanvasId !== null && !canvases[canvas.parentCanvasId]) {
      delete canvases[canvas.id]
    }
  }
  // Every workspace must keep a valid root canvas.
  for (const ws of Object.values(workspaces)) {
    if (!canvases[ws.rootCanvasId]) delete workspaces[ws.id]
  }
  for (const canvas of Object.values(canvases)) {
    if (!workspaces[canvas.workspaceId]) delete canvases[canvas.id]
  }
  if (Object.keys(workspaces).length === 0) return null

  const widgets: Record<string, Widget> = {}
  for (const [id, widget] of Object.entries(parsed.widgets)) {
    if (isValidWidget(widget, true) && widget.id === id && canvases[widget.canvasId]) {
      widgets[id] = widget
    }
  }

  const firstWorkspace = Object.values(workspaces)[0]!
  const activeWorkspaceId =
    typeof parsed.activeWorkspaceId === 'string' && workspaces[parsed.activeWorkspaceId]
      ? parsed.activeWorkspaceId
      : firstWorkspace.id
  const activeCanvasId =
    typeof parsed.activeCanvasId === 'string' &&
    canvases[parsed.activeCanvasId]?.workspaceId === activeWorkspaceId
      ? parsed.activeCanvasId
      : workspaces[activeWorkspaceId]!.rootCanvasId

  const canvasViews: Record<string, { pan: Vector2D; zoom: number }> = {}
  if (isRecord(parsed.canvasViews)) {
    for (const [canvasId, view] of Object.entries(parsed.canvasViews)) {
      if (!canvases[canvasId] || !isRecord(view)) continue
      if (!isVector(view.pan) || !isFiniteNumber(view.zoom)) continue
      canvasViews[canvasId] = { pan: view.pan, zoom: clampZoom(view.zoom) }
    }
  }

  return {
    workspaces,
    canvases,
    widgets,
    relations: parseRelations(parsed.relations, widgets),
    connections: parseConnections(parsed.connections, widgets),
    groups: parseGroups(parsed.groups, widgets),
    activePacks: parsePacks(parsed.activePacks),
    activeWorkspaceId,
    activeCanvasId,
    canvasViews,
  }
}

/**
 * Load the persisted board, or null when nothing valid was saved yet (first
 * visit, cleared storage, or unparseable payload) — the caller seeds then.
 * An empty-but-valid board is honored: deleting everything must stick.
 */
export function loadPersistedBoard(): PersistedBoard | null {
  const v2 = parseV2Board(readJson(BOARD_KEY))
  if (v2) return v2
  return migrateV1Board(readJson(BOARD_KEY_V1))
}

/**
 * Validate an arbitrary JSON value as a v2 board — used to sanity-check
 * payloads pulled from Supabase, which are just as untrusted as anything in
 * localStorage (a stale schema, a hand-edited row, a partial write).
 */
export function parsePersistedBoard(raw: unknown): PersistedBoard | null {
  return parseV2Board(raw)
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
export function buildBoardSnapshot(state: WidgetStoreState): PersistedBoard {
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

export function initPersistence(
  widgetStore: StoreApi<WidgetStoreState>,
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
