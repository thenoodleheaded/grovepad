import type { CanvasMeta } from '../../types/spatial'
import { snapToGrid } from '../../types/spatial'
import { layoutThoughtPlan, layoutWidth } from '../../utils/planLayout'
import { isWidgetTypePublic, widgetDefinition } from '../../widgets/registry'
import { useToastStore } from '../useToastStore'
import { computeBlockedWidgetIds } from '../widgetGraph'
import { appendDraftRelation, relationKey } from '../widgetRelationDrafts'
import { buildWidget, computeDataHeight } from '../widgetSizing'
import { settleWidgetLayout, settleWidgetsByCanvas } from '../widgetSettling'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'
export function createWidgetCreationSlice({ set, get, pushHistory, markSpawned }: WidgetStoreSliceContext): WidgetStoreSlice {
  let flashTimer: ReturnType<typeof setTimeout> | null = null
  return {
  flashWidgetId: null,
  flashWidget: (id) => {
    if (!get().widgets[id]) return
    if (flashTimer) clearTimeout(flashTimer)
    set({ flashWidgetId: id })
    flashTimer = setTimeout(() => {
      flashTimer = null
      if (get().flashWidgetId === id) set({ flashWidgetId: null })
    }, 1500)
  },

  createWidget: (title, position, type) => {
    if (!isWidgetTypePublic(type)) {
      useToastStore.getState().addToast(widgetDefinition(type).unavailableReason ?? 'This widget is not available')
      return ''
    }
    pushHistory()
    const id = crypto.randomUUID()
    const state = get()
    const widget = buildWidget(id, type, title, state.activeCanvasId, {
      x: snapToGrid(position.x),
      y: snapToGrid(position.y),
    })
    // A canvas node is backed by a real canvas — create it alongside.
    let newCanvas: CanvasMeta | null = null
    if (widget.type === 'canvas_node') {
      const subCanvasId = crypto.randomUUID()
      newCanvas = {
        id: subCanvasId,
        name: title,
        workspaceId: state.activeWorkspaceId,
        parentCanvasId: state.activeCanvasId,
      }
      widget.data = { ...widget.data, canvasId: subCanvasId }
    }
    set((current) => ({
      widgets: settleWidgetLayout({ ...current.widgets, [id]: widget }, [id]),
      widgetStructureVersion: current.widgetStructureVersion + 1,
      ...(newCanvas ? { canvases: { ...current.canvases, [newCanvas.id]: newCanvas } } : {}),
    }))
    markSpawned(id)
    return id
  },

  commitThoughtPlan: (plan, origin, parentId) => {
    if (plan.nodes.length === 0) return []
    pushHistory('thought-plan')

    const state = get()
    let widgets = { ...state.widgets }
    const relations = { ...state.relations }
    let canvases = state.canvases
    const ids = new Map<string, string>()
    const created: string[] = []
    const settleIds = new Set<string>()
    const relationKeys = new Set(
      Object.values(relations).map((relation) =>
        relationKey(relation.fromId, relation.toId, relation.type),
      ),
    )
    // Tidy-tree layout: children rows under centered parents. The tree is
    // centered horizontally on the origin so commits land where the user
    // is looking instead of sprawling rightward off-screen.
    const nodeSizes: Record<string, { width: number; height: number }> = {}
    for (const node of plan.nodes) {
      const defaultSize = widgetDefinition(node.widgetType).defaultSize
      const dataHeight = node.widgetType === 'canvas_node'
        ? 0
        : computeDataHeight(node.widgetType, node.data)
      nodeSizes[node.temporaryId] = {
        width: defaultSize.width,
        height: dataHeight > 0 ? dataHeight : defaultSize.height,
      }
    }
    const treePositions = layoutThoughtPlan(plan, nodeSizes)
    const treeWidth = layoutWidth(treePositions, nodeSizes)

    plan.nodes.forEach((node) => {
      if (!isWidgetTypePublic(node.widgetType)) return
      if (node.existingWidgetId && widgets[node.existingWidgetId]) {
        ids.set(node.temporaryId, node.existingWidgetId)
        return
      }

      const id = crypto.randomUUID()
      const treePosition = treePositions[node.temporaryId] ?? { x: 0, y: 0 }
      const widget = buildWidget(id, node.widgetType, node.title, state.activeCanvasId, {
        x: snapToGrid(origin.x - treeWidth / 2 + treePosition.x),
        y: snapToGrid(origin.y + treePosition.y),
      })

      if (widget.type === 'canvas_node') {
        const subCanvasId = crypto.randomUUID()
        canvases = {
          ...canvases,
          [subCanvasId]: {
            id: subCanvasId,
            name: node.title,
            workspaceId: state.activeWorkspaceId,
            parentCanvasId: state.activeCanvasId,
          },
        }
        widget.data = { ...widget.data, canvasId: subCanvasId }
      } else {
        const height = computeDataHeight(node.widgetType, node.data)
        widget.data = node.data
        if (height > 0 && height !== widget.size.height) {
          widget.size = { ...widget.size, height }
        }
      }
      widget.metadata = node.metadata

      widgets[id] = widget
      ids.set(node.temporaryId, id)
      created.push(id)
      settleIds.add(id)
    })

    for (const relation of plan.relations) {
      const fromId = ids.get(relation.fromTemporaryId)
      const toId = ids.get(relation.toTemporaryId)
      if (fromId && toId) {
        appendDraftRelation(widgets, relations, relationKeys, fromId, toId, relation.type)
      }
    }

    if (parentId && widgets[parentId]) {
      const childIds = new Set(plan.relations.map((relation) => relation.toTemporaryId))
      for (const node of plan.nodes) {
        if (childIds.has(node.temporaryId)) continue
        const childId = ids.get(node.temporaryId)
        if (childId) {
          appendDraftRelation(widgets, relations, relationKeys, parentId, childId, 'parent')
        }
      }
    }

    const selectedIds = new Set(created.length ? created : ids.values())
    set({
      widgets: settleWidgetsByCanvas(widgets, settleIds),
      widgetStructureVersion:
        state.widgetStructureVersion + (created.length > 0 ? 1 : 0),
      canvases,
      relations,
      blockedWidgetIds: computeBlockedWidgetIds(relations),
      selectedIds,
    })
    for (const id of created) markSpawned(id)
    return created
  },
  }
}
