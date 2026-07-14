import type { Connection } from '../../types/circuit'
import type { CanvasMeta, CanvasNodeData, Relation, Widget, WidgetGroup } from '../../types/spatial'
import { useCanvasStore } from '../useCanvasStore'
import { useToastStore } from '../useToastStore'
import { buildGroupIndex, computeBlockedWidgetIds } from '../widgetGraph'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'
export function createNavigationSlice({ set, get, pushHistory, navigateToCanvas }: WidgetStoreSliceContext): WidgetStoreSlice {
  return {
  createWorkspace: (name) => {
    const trimmed = name.trim() || 'Untitled'
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

      const groups: Record<string, WidgetGroup> = {}
      for (const [gid, group] of Object.entries(current.groups)) {
        const widgetIds = group.widgetIds.filter((wid) => widgets[wid])
        if (widgetIds.length >= 2) groups[gid] = { ...group, widgetIds }
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
        groups,
        widgetGroupIndex: buildGroupIndex(groups),
        blockedWidgetIds: computeBlockedWidgetIds(relations),
        canvasViews,
        selectedIds: new Set<string>(),
      }
    })
    // If we were inside the deleted workspace, land on another one's root.
    const after = get()
    if (!after.workspaces[after.activeWorkspaceId] || !after.canvases[after.activeCanvasId]) {
      const fallback = Object.values(after.workspaces)[0]
      if (fallback) {
        set({ activeWorkspaceId: fallback.id, activeCanvasId: fallback.rootCanvasId })
        const saved = after.canvasViews[fallback.rootCanvasId]
        const camera = useCanvasStore.getState()
        if (saved) camera.setView(saved.pan, saved.zoom)
        else camera.setView({ x: 0, y: 0 }, 1)
      }
    }
    useToastStore.getState().addToast(`Deleted workspace “${ws.name}”`, {
      action: { label: 'Undo', run: () => get().undo() },
    })
  },

  switchWorkspace: (id) => {
    const ws = get().workspaces[id]
    if (!ws) return
    navigateToCanvas(ws.rootCanvasId)
  },

  navigateToCanvas: (canvasId) => navigateToCanvas(canvasId),

  renameCanvas: (canvasId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
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
  }
}
