import type { Connection } from '../../types/circuit'
import type { HydratedPersistedBoard } from '../../types/persistence'
import type { CanvasMeta, CanvasNodeData, Relation, Widget, WidgetGlue } from '../../types/spatial'
import { useCanvasStore } from '../useCanvasStore'
import { useToastStore } from '../useToastStore'
import { planBoardCanvasEmbedding } from '../../utils/boardCanvasEmbedding'
import {
  closeCanvasTab,
  insertCanvasTab,
  reorderCanvasTabs,
  resolveCanvasTabs,
} from '../canvasTabs'
import { lastVisitedCanvasIn, readCanvasVisits } from '../canvasRecents'
import { buildGlueIndex, computeBlockedWidgetIds } from '../widgetGraph'
import { settleWidgetLayout } from '../widgetSettling'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'
export function createNavigationSlice({ set, get, pushHistory, navigateToCanvas, markSpawned }: WidgetStoreSliceContext): WidgetStoreSlice {
  return {
  createWorkspace: (name) => {
    const trimmed = name.trim() || 'Untitled'
    // Workspace creation is a canonical board mutation. Capturing it clears
    // any stale redo branch before the new workspace becomes reachable.
    pushHistory()
    const workspaceId = crypto.randomUUID()
    const rootCanvasId = crypto.randomUUID()
    set((state) => ({
      workspaces: {
        ...state.workspaces,
        [workspaceId]: {
          id: workspaceId,
          name: trimmed,
          rootCanvasId,
          createdAt: Date.now(),
          sortIndex: Object.keys(state.workspaces).length,
          tint: ['#84cc16', '#60a5fa', '#a78bfa', '#f59e0b'][Object.keys(state.workspaces).length % 4],
        },
      },
      canvases: {
        ...state.canvases,
        [rootCanvasId]: {
          id: rootCanvasId,
          name: 'Origin',
          workspaceId,
          parentCanvasId: null,
        },
      },
    }))
    navigateToCanvas(rootCanvasId)
    useToastStore.getState().addToast(`Workspace “${trimmed}” created`)
    return workspaceId
  },

  renameWorkspace: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = get().workspaces[id]
    if (!existing || existing.name === trimmed) return
    // Tagged so a name typed one keystroke at a time collapses into one undo
    // step rather than a hundred.
    pushHistory(`workspace-name:${id}`)
    set((state) => {
      const ws = state.workspaces[id]
      if (!ws || ws.name === trimmed) return state
      return { workspaces: { ...state.workspaces, [id]: { ...ws, name: trimmed } } }
    })
  },

  reorderWorkspace: (sourceId, targetId) => {
    if (sourceId === targetId) return
    const state = get()
    if (!state.workspaces[sourceId] || !state.workspaces[targetId]) return
    const ordered = Object.values(state.workspaces).sort(
      (a, b) => (a.sortIndex ?? a.createdAt) - (b.sortIndex ?? b.createdAt),
    )
    const source = ordered.find((workspace) => workspace.id === sourceId)!
    const remaining = ordered.filter((workspace) => workspace.id !== sourceId)
    remaining.splice(remaining.findIndex((workspace) => workspace.id === targetId), 0, source)
    pushHistory()
    set((current) => ({
      workspaces: Object.fromEntries(
        remaining.map((workspace, index) => [workspace.id, { ...current.workspaces[workspace.id]!, sortIndex: index }]),
      ),
    }))
  },

  deleteWorkspace: (id) => {
    const state = get()
    const ws = state.workspaces[id]
    if (!ws || Object.keys(state.workspaces).length <= 1) return
    pushHistory()
    set((current) => {
      const workspaces = { ...current.workspaces }
      delete workspaces[id]

      const canvases: Record<string, CanvasMeta> = {}
      const removedCanvasIds = new Set<string>()
      for (const [cid, canvas] of Object.entries(current.canvases)) {
        if (canvas.workspaceId === id) removedCanvasIds.add(cid)
        else canvases[cid] = canvas
      }

      const widgets: Record<string, Widget> = {}
      for (const [wid, widget] of Object.entries(current.widgets)) {
        if (!removedCanvasIds.has(widget.canvasId)) widgets[wid] = widget
      }

      const relations: Record<string, Relation> = {}
      for (const [rid, relation] of Object.entries(current.relations)) {
        if (widgets[relation.fromId] && widgets[relation.toId]) relations[rid] = relation
      }

      const connections: Record<string, Connection> = {}
      for (const [cid, connection] of Object.entries(current.connections)) {
        if (widgets[connection.fromId] && widgets[connection.toId]) connections[cid] = connection
      }

      const glues: Record<string, WidgetGlue> = {}
      for (const [gid, glue] of Object.entries(current.glues)) {
        const widgetIds = glue.widgetIds.filter((wid) => widgets[wid])
        if (widgetIds.length >= 2) glues[gid] = { ...glue, widgetIds }
      }

      const canvasViews = { ...current.canvasViews }
      for (const cid of removedCanvasIds) delete canvasViews[cid]

      return {
        workspaces,
        canvases,
        widgets,
        widgetStructureVersion: current.widgetStructureVersion + 1,
        relations,
        connections,
        glues,
        widgetGlueIndex: buildGlueIndex(glues),
        blockedWidgetIds: computeBlockedWidgetIds(relations),
        canvasViews,
        selectedIds: new Set<string>(),
      }
    })
    // If we were inside the deleted workspace, land on another one's root.
    const after = get()
    const landedOutside =
      !after.workspaces[after.activeWorkspaceId] || !after.canvases[after.activeCanvasId]
    const fallback = landedOutside ? Object.values(after.workspaces)[0] : undefined
    const activeCanvasId = fallback?.rootCanvasId ?? after.activeCanvasId
    // Background tabs can be parked deep inside the workspace that just went
    // away, so the whole row is repaired, not only the tab in front.
    const tabs = resolveCanvasTabs({ ...after, activeCanvasId }, after.canvases)
    set({
      activeWorkspaceId:
        after.canvases[tabs.activeCanvasId]?.workspaceId ?? after.activeWorkspaceId,
      activeCanvasId: tabs.activeCanvasId,
      activeTabId: tabs.activeTabId,
      openTabs: tabs.openTabs,
    })
    if (landedOutside && tabs.activeCanvasId !== after.activeCanvasId) {
      const saved = after.canvasViews[tabs.activeCanvasId]
      const camera = useCanvasStore.getState()
      if (saved) camera.setView(saved.pan, saved.zoom)
      else camera.setView({ x: 0, y: 0 }, 1)
    }
    useToastStore.getState().addToast(`Deleted workspace “${ws.name}”`, {
      action: { label: 'Undo', run: () => get().undo() },
    })
  },

  switchWorkspace: (id) => {
    const ws = get().workspaces[id]
    if (!ws) return
    // Land where the user last stood in this workspace, not on its root —
    // the same courtesy per-canvas camera memory already extends within one.
    const remembered = lastVisitedCanvasIn(readCanvasVisits(), get().canvases, id)
    navigateToCanvas(remembered ?? ws.rootCanvasId)
  },

  navigateToCanvas: (canvasId) => navigateToCanvas(canvasId),

  openCanvasTab: (canvasId, options) => {
    const state = get()
    if (!state.canvases[canvasId]) return
    const activate = options?.activate ?? true
    const next = insertCanvasTab(state, canvasId, { activate })
    set({ openTabs: next.openTabs })
    // A background tab is bookkeeping only; an activated one is a real
    // navigation, so it goes through the shared core to park the camera it is
    // leaving and restore the one it lands on.
    if (activate) navigateToCanvas(canvasId, next.activeTabId)
  },

  closeCanvasTab: (tabId) => {
    const state = get()
    const next = closeCanvasTab(state, tabId)
    if (!next) return
    set({ openTabs: next.openTabs })
    if (next.activeTabId !== state.activeTabId) {
      navigateToCanvas(next.activeCanvasId, next.activeTabId)
    }
  },

  activateCanvasTab: (tabId) => {
    const tab = get().openTabs.find((entry) => entry.id === tabId)
    if (!tab) return
    navigateToCanvas(tab.canvasId, tab.id)
  },

  reorderCanvasTab: (sourceTabId, targetTabId) => {
    set((state) => ({ openTabs: reorderCanvasTabs(state.openTabs, sourceTabId, targetTabId) }))
  },

  renameCanvas: (canvasId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = get().canvases[canvasId]
    if (!existing || existing.name === trimmed) return
    pushHistory(`canvas-name:${canvasId}`)
    set((state) => {
      const canvas = state.canvases[canvasId]
      if (!canvas || canvas.name === trimmed) return state
      // Keep the owning canvas-node widget's title in sync.
      let widgets = state.widgets
      for (const widget of Object.values(state.widgets)) {
        if (
          widget.type === 'canvas_node' &&
          (widget.data as CanvasNodeData).canvasId === canvasId &&
          widget.title !== trimmed
        ) {
          widgets = { ...widgets, [widget.id]: { ...widget, title: trimmed } }
        }
      }
      return {
        canvases: { ...state.canvases, [canvasId]: { ...canvas, name: trimmed } },
        widgets,
      }
    })
  },

  updateCanvasSettings: (canvasId, settings) => {
    if (!get().canvases[canvasId]) return
    // Dragging the grid-intensity slider is one continuous adjustment, so all
    // of its writes coalesce into a single undo step per canvas.
    pushHistory(`canvas-settings:${canvasId}`)
    set((state) => {
      const canvas = state.canvases[canvasId]
      if (!canvas) return state
      const next = {
        ...canvas,
        ...(typeof settings.shared === 'boolean' ? { shared: settings.shared } : {}),
        ...(typeof settings.gridIntensity === 'number' && Number.isFinite(settings.gridIntensity)
          ? { gridIntensity: Math.min(100, Math.max(0, Math.round(settings.gridIntensity))) }
          : {}),
        ...(typeof settings.linksVisible === 'boolean'
          ? { linksVisible: settings.linksVisible }
          : {}),
      }
      return {
        canvases: { ...state.canvases, [canvasId]: next },
      }
    })
  },

  reparentCanvas: (canvasId, parentCanvasId) => {
    const state = get()
    const canvas = state.canvases[canvasId]
    const parent = state.canvases[parentCanvasId]
    if (!canvas || !parent || canvas.parentCanvasId === null || canvas.workspaceId !== parent.workspaceId || canvasId === parentCanvasId) return
    let cursor: CanvasMeta | undefined = parent
    while (cursor) {
      if (cursor.id === canvasId) return
      cursor = cursor.parentCanvasId ? state.canvases[cursor.parentCanvasId] : undefined
    }
    pushHistory()
    set((current) => ({ canvases: { ...current.canvases, [canvasId]: { ...canvas, parentCanvasId } } }))
  },

  importBoardAsCanvas: (board: HydratedPersistedBoard, title, position) => {
    const state = get()
    if (!state.canvases[state.activeCanvasId] || !state.workspaces[state.activeWorkspaceId]) return null
    const embedding = planBoardCanvasEmbedding(state, board, { title, position })
    pushHistory('board-canvas-import')
    set((current) => {
      const widgets = settleWidgetLayout(
        { ...current.widgets, ...embedding.widgets },
        [embedding.rootWidgetId],
      )
      const relations = { ...current.relations, ...embedding.relations }
      const glues = { ...current.glues, ...embedding.glues }
      return {
        canvases: { ...current.canvases, ...embedding.canvases },
        widgets,
        widgetStructureVersion: current.widgetStructureVersion + 1,
        relations,
        connections: { ...current.connections, ...embedding.connections },
        glues,
        widgetGlueIndex: buildGlueIndex(glues),
        blockedWidgetIds: computeBlockedWidgetIds(relations),
        activePacks: [...new Set([...current.activePacks, ...board.activePacks])],
        selectedIds: new Set([embedding.rootWidgetId]),
      }
    })
    markSpawned(embedding.rootWidgetId)
    return { rootWidgetId: embedding.rootWidgetId, widgetIdMap: embedding.widgetIdMap }
  },
  }
}
