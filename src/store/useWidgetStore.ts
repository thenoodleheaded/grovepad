import { create } from 'zustand'
import { loadPersistedBoard } from '../utils/persistence'
import type { Connection } from '../types/circuit'
import { widgetDefinition } from '../widgets/registry'
import { useCanvasStore } from './useCanvasStore'
import { createHistorySession } from './widgetHistory'
import type { WidgetStoreState } from './widgetStoreTypes'
export type { WidgetStoreState } from './widgetStoreTypes'
import type {
  CanvasMeta,
  ModuleType,
  Relation,
  Widget,
  WidgetGroup,
  Workspace,
} from '../types/spatial'
import { GRID_SIZE } from '../types/spatial'

import { SEED_ROOT_CANVAS_ID, SEED_WORKSPACE_ID, createSeedCanvases, createSeedRelations, createSeedWidgets, createSeedWorkspaces } from './widgetSeeds'
import { setGroupIndexProvider } from './widgetSettling'
import { buildGroupIndex, computeBlockedWidgetIds } from './widgetGraph'
import { createNavigationSlice } from './slices/navigationSlice'
import { createWidgetCreationSlice } from './slices/widgetCreationSlice'
import { createWidgetLayoutSlice } from './slices/widgetLayoutSlice'
import { createCircuitSlice } from './slices/circuitSlice'
import { createGroupSlice } from './slices/groupSlice'
import { createSelectionSlice } from './slices/selectionSlice'
import { createUiLinkingSlice } from './slices/uiLinkingSlice'

export { untangleCanvasLayout } from './widgetUntangle'
export { getCriticalPath } from './widgetGraph'


interface HistorySnapshot {
  widgets: Record<string, Widget>
  relations: Record<string, Relation>
  connections: Record<string, Connection>
  groups: Record<string, WidgetGroup>
  widgetGroupIndex: Record<string, string>
  canvases: Record<string, CanvasMeta>
  workspaces: Record<string, Workspace>
}

// ---------------------------------------------------------------------------
// Spawn tracking — lets freshly created widgets play a one-shot entrance
// animation without replaying it when they scroll back into view later.
// ---------------------------------------------------------------------------

const recentlySpawnedIds = new Set<string>()

export function isRecentlySpawned(id: string): boolean {
  return recentlySpawnedIds.has(id)
}

function markSpawned(id: string): void {
  recentlySpawnedIds.add(id)
  setTimeout(() => recentlySpawnedIds.delete(id), 600)
}

// Hydrate from localStorage when a saved board exists (even an empty one —
// deleting everything must survive a reload); otherwise seed a starter board.
const persistedBoard = loadPersistedBoard()
const initialWorkspaces = persistedBoard?.workspaces ?? createSeedWorkspaces()
const initialCanvases = persistedBoard?.canvases ?? createSeedCanvases()
const loadedWidgets = persistedBoard?.widgets ?? createSeedWidgets()
// Repair cards enlarged by the short-lived intrinsic-height initialization
// loop. Only types exposed while that build was live are targeted; their new
// registry defaults already include enough room for the complete starter UI.
const INITIAL_FIT_FEEDBACK_TYPES = new Set<ModuleType>([
  'clock_pulse',
  'meal_planner',
  'home_maintenance',
  'chore_rotation',
  'renewals_vault',
])
// Repair heights produced by the short-lived global overflow-growth rule.
// Legitimate intrinsic growth remains below this generous per-type ceiling;
// multi-page form/list cards use their own internal scrollers.
const initialWidgets = Object.fromEntries(
  Object.entries(loadedWidgets).map(([id, widget]) => {
    const definition = widgetDefinition(widget.type)
    const defaultHeight = Math.max(
      definition.defaultSize.height,
      definition.sizing?.minHeight ?? 0,
    )
    const runawayHeight = Math.max(defaultHeight * 2, GRID_SIZE * 12)
    const feedbackLoopHeight =
      INITIAL_FIT_FEEDBACK_TYPES.has(widget.type) && widget.size.height > defaultHeight
    const size =
      !widget.collapsed && !widget.iconified && (widget.size.height > runawayHeight || feedbackLoopHeight)
        ? { ...widget.size, height: defaultHeight }
        : widget.size
    const expandedSize =
      widget.expandedSize && widget.expandedSize.height > runawayHeight
        ? { ...widget.expandedSize, height: defaultHeight }
        : widget.expandedSize
    return [id, size === widget.size && expandedSize === widget.expandedSize
      ? widget
      : { ...widget, size, expandedSize }]
  }),
) as Record<string, Widget>
const initialRelations = persistedBoard?.relations ?? createSeedRelations()
const initialConnections = persistedBoard?.connections ?? {}
const initialGroups = persistedBoard?.groups ?? {}
const initialPacks = persistedBoard?.activePacks ?? []
const initialActiveWorkspaceId =
  persistedBoard?.activeWorkspaceId ?? Object.keys(initialWorkspaces)[0] ?? SEED_WORKSPACE_ID
const initialActiveCanvasId =
  persistedBoard?.activeCanvasId ??
  initialWorkspaces[initialActiveWorkspaceId]?.rootCanvasId ??
  SEED_ROOT_CANVAS_ID
const initialCanvasViews = persistedBoard?.canvasViews ?? {}

/** Root → canvas chain used for the breadcrumb trail. */
export function getCanvasPath(
  canvases: Record<string, CanvasMeta>,
  canvasId: string,
): CanvasMeta[] {
  const path: CanvasMeta[] = []
  let current = canvases[canvasId]
  let guard = 0
  while (current && guard++ < 64) {
    path.unshift(current)
    current = current.parentCanvasId ? canvases[current.parentCanvasId] : undefined
  }
  return path
}

export const useWidgetStore = create<WidgetStoreState>()((set, get) => {
  const history = createHistorySession<HistorySnapshot>()

  /** Push the current structural state onto the undo stack (pre-mutation). */
  const pushHistory = (tag?: string) => {
    const state = get()
    const captured = history.capture({
      widgets: state.widgets,
      relations: state.relations,
      connections: state.connections,
      groups: state.groups,
      widgetGroupIndex: state.widgetGroupIndex,
      canvases: state.canvases,
      workspaces: state.workspaces,
    }, tag)
    if (!captured) return
    if (!state.canUndo || state.canRedo) set({ canUndo: true, canRedo: false })
  }

  const applySnapshot = (snapshot: HistorySnapshot) => {
    const state = get()
    const selectedIds = new Set(
      [...state.selectedIds].filter((id) => snapshot.widgets[id]),
    )
    // The active canvas/workspace may not exist in the restored snapshot
    // (undoing past a canvas creation, redoing a cascade delete) — fall back
    // up the chain: same canvas → workspace root → any surviving canvas.
    let activeWorkspaceId = state.activeWorkspaceId
    if (!snapshot.workspaces[activeWorkspaceId]) {
      activeWorkspaceId = Object.keys(snapshot.workspaces)[0] ?? activeWorkspaceId
    }
    let activeCanvasId = state.activeCanvasId
    if (!snapshot.canvases[activeCanvasId]) {
      activeCanvasId =
        snapshot.workspaces[activeWorkspaceId]?.rootCanvasId ??
        Object.keys(snapshot.canvases)[0] ??
        activeCanvasId
    } else {
      activeWorkspaceId = snapshot.canvases[activeCanvasId]!.workspaceId
    }
    set({
      widgets: snapshot.widgets,
      widgetStructureVersion: state.widgetStructureVersion + 1,
      relations: snapshot.relations,
      connections: snapshot.connections,
      groups: snapshot.groups,
      widgetGroupIndex: snapshot.widgetGroupIndex,
      canvases: snapshot.canvases,
      workspaces: snapshot.workspaces,
      activeWorkspaceId,
      activeCanvasId,
      blockedWidgetIds: computeBlockedWidgetIds(snapshot.relations),
      selectedIds,
      contextMenu: null,
      linkDrag: null,
      childLinkSource: null,
      dependencyLinkSource: null,
      ...history.status(),
    })
  }

  const currentSnapshot = (): HistorySnapshot => {
    const state = get()
    return {
      widgets: state.widgets,
      relations: state.relations,
      connections: state.connections,
      groups: state.groups,
      widgetGroupIndex: state.widgetGroupIndex,
      canvases: state.canvases,
      workspaces: state.workspaces,
    }
  }

  /** Shared canvas-navigation core: park the camera, swap canvas, restore. */
  const navigateToCanvasImpl = (canvasId: string) => {
    const state = get()
    const target = state.canvases[canvasId]
    if (!target || canvasId === state.activeCanvasId) return
    const camera = useCanvasStore.getState()
    const canvasViews = {
      ...state.canvasViews,
      [state.activeCanvasId]: { pan: camera.pan, zoom: camera.zoom },
    }
    set({
      activeCanvasId: canvasId,
      activeWorkspaceId: target.workspaceId,
      canvasViews,
      selectedIds: new Set<string>(),
      contextMenu: null,
      linkDrag: null,
      childLinkSource: null,
      dependencyLinkSource: null,
      ghostConfig: null,
    })
    const saved = canvasViews[canvasId]
    if (saved) camera.setView(saved.pan, saved.zoom)
    else camera.setView({ x: 0, y: 0 }, 1)
  }

  const sliceContext = {
    set,
    get,
    pushHistory,
    navigateToCanvas: navigateToCanvasImpl,
    markSpawned,
    initialPacks,
  }

  return {
  widgets: initialWidgets,
  widgetStructureVersion: 0,
  relations: initialRelations,
  connections: initialConnections,
  blockedWidgetIds: computeBlockedWidgetIds(initialRelations),
  criticalPathVisible: false,

  workspaces: initialWorkspaces,
  canvases: initialCanvases,
  activeWorkspaceId: initialActiveWorkspaceId,
  activeCanvasId: initialActiveCanvasId,
  canvasViews: initialCanvasViews,

  ...createNavigationSlice(sliceContext),

  canUndo: false,
  canRedo: false,

  undo: () => {
    const snapshot = history.undo(currentSnapshot())
    if (!snapshot) return
    applySnapshot(snapshot)
  },

  redo: () => {
    const snapshot = history.redo(currentSnapshot())
    if (!snapshot) return
    applySnapshot(snapshot)
  },

  snapshotHistory: (tag) => pushHistory(tag),

  loadBoard: (board) => {
    history.clear()
    const current = get()
    set({
      workspaces: board.workspaces,
      canvases: board.canvases,
      widgets: board.widgets,
      widgetStructureVersion: current.widgetStructureVersion + 1,
      relations: board.relations,
      connections: board.connections,
      groups: board.groups,
      widgetGroupIndex: buildGroupIndex(board.groups),
      activePacks: board.activePacks,
      activeWorkspaceId: board.activeWorkspaceId,
      activeCanvasId: board.activeCanvasId,
      canvasViews: board.canvasViews,
      blockedWidgetIds: computeBlockedWidgetIds(board.relations),
      selectedIds: new Set(),
      contextMenu: null,
      linkDrag: null,
      childLinkSource: null,
      dependencyLinkSource: null,
      ghostConfig: null,
      canUndo: false,
      canRedo: false,
    })
  },

  ...createWidgetCreationSlice(sliceContext),

  ...createWidgetLayoutSlice(sliceContext),

  ...createCircuitSlice(sliceContext),

  groups: initialGroups,
  widgetGroupIndex: buildGroupIndex(initialGroups),

  ...createGroupSlice(sliceContext),

  selectedIds: new Set<string>(),

  ...createSelectionSlice(sliceContext),

  ...createUiLinkingSlice(sliceContext),
  } as WidgetStoreState
})

setGroupIndexProvider(() => useWidgetStore.getState().widgetGroupIndex)
