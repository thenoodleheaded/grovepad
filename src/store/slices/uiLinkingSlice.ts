import type { GhostTreeNode, ModuleType, SearchResult, Vector2D, WidgetGroup } from '../../types/spatial'
import { GHOST_PITCH_Y, GHOST_SIBLINGS_PER_SIDE_MAX, MODULE_LABELS, snapToGrid } from '../../types/spatial'
import { ghostGestureIds, ghostGestureState, gestureGhostId, layoutGhostTree } from '../widgetGhostLayout'
import { buildGroupIndex, computeBlockedWidgetIds, nextGroupColor } from '../widgetGraph'
import { appendDraftRelation, relationKey } from '../widgetRelationDrafts'
import { buildWidget, fuzzyScore } from '../widgetSizing'
import { settleWidgetsByCanvas } from '../widgetSettling'
import { applyWidgetPositions, compactGroupPositions } from '../widgetCollection'
import { buildTreeRevealSchedule, registerTreeReveal } from '../treeReveal'
import type { WidgetStoreSlice, WidgetStoreSliceContext } from '../widgetStoreSliceContext'
export function createUiLinkingSlice({ set, get, pushHistory, initialPacks }: WidgetStoreSliceContext): WidgetStoreSlice {
  return {
  contextMenu: null,
  openContextMenu: (widgetId, x, y) => {
    set((state) =>
      state.widgets[widgetId] ? { contextMenu: { widgetId, x, y } } : state,
    )
  },
  closeContextMenu: () => {
    set((state) => (state.contextMenu ? { contextMenu: null } : state))
  },

  addWidgetAt: null,
  addWidgetView: 'widgets',
  openAddWidget: (worldPos, view = 'widgets') =>
    set({ addWidgetAt: worldPos, addWidgetView: view }),
  closeAddWidget: () => {
    set((state) => (state.addWidgetAt ? { addWidgetAt: null } : state))
  },

  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) =>
    set((state) => (state.shortcutsOpen === shortcutsOpen ? state : { shortcutsOpen })),

  importOpen: false,
  setImportOpen: (importOpen) =>
    set((state) => (state.importOpen === importOpen ? state : { importOpen })),

  importMindmap: (widgets, groups, relations) => {
    pushHistory()
    set((state) => {
      const nextWidgets = { ...state.widgets, ...widgets }
      const nextGroups = { ...state.groups, ...groups }
      
      const nextRelations = { ...state.relations }
      relations.forEach((r) => {
        nextRelations[r.id] = r
      })

      const nextWidgetGroupIndex = { ...state.widgetGroupIndex }
      Object.entries(groups).forEach(([groupId, g]) => {
        g.widgetIds.forEach((wid) => {
          nextWidgetGroupIndex[wid] = groupId
        })
      })

      return {
        widgets: nextWidgets,
        widgetStructureVersion: state.widgetStructureVersion + 1,
        groups: nextGroups,
        relations: nextRelations,
        widgetGroupIndex: nextWidgetGroupIndex,
      }
    })
  },



  quickAddOpen: false,
  setQuickAddOpen: (quickAddOpen) =>
    set((state) => (state.quickAddOpen === quickAddOpen ? state : { quickAddOpen })),

  activePacks: initialPacks,
  togglePack: (pack) =>
    set((state) => ({
      activePacks: state.activePacks.includes(pack)
        ? state.activePacks.filter((p) => p !== pack)
        : [...state.activePacks, pack],
    })),

  paletteOpen: false,
  setPaletteOpen: (paletteOpen) =>
    set((state) => (state.paletteOpen === paletteOpen ? state : { paletteOpen })),

  searchWidgets: (query) => {
    if (!query.trim()) return []
    const { widgets, canvases, activeWorkspaceId, activeCanvasId } = get()
    const results: SearchResult[] = []
    for (const w of Object.values(widgets)) {
      const canvas = canvases[w.canvasId]
      if (!canvas || canvas.workspaceId !== activeWorkspaceId) continue
      const titleScore = fuzzyScore(query, w.title)
      const typeScore = fuzzyScore(query, MODULE_LABELS[w.type])
      if (Math.max(titleScore, typeScore) === 0) continue
      const onOtherCanvas = w.canvasId !== activeCanvasId
      results.push({
        id: w.id,
        type: 'widget',
        title: w.title,
        subtitle: onOtherCanvas
          ? `${MODULE_LABELS[w.type]} · ${canvas.name}`
          : MODULE_LABELS[w.type],
        canvasId: w.canvasId,
        position: {
          x: w.position.x + w.size.width / 2,
          y: w.position.y + w.size.height / 2,
        },
      })
    }
    return results.sort((a, b) => fuzzyScore(query, b.title) - fuzzyScore(query, a.title))
  },

  linkDrag: null,
  startLinkDrag: (sourceId, cursorWorld, dropScreen) =>
    set({ linkDrag: { sourceId, cursorWorld, dropScreen } }),
  updateLinkDragCursor: (cursorWorld, dropScreen) =>
    set((state) =>
      state.linkDrag ? { linkDrag: { ...state.linkDrag, cursorWorld, dropScreen } } : state,
    ),
  endLinkDrag: (targetId) => {
    const { linkDrag } = get()
    if (!linkDrag) return
    set({ linkDrag: null })
    if (!targetId || targetId === linkDrag.sourceId) return
    const state = get()
    const source = state.widgets[linkDrag.sourceId]
    const target = state.widgets[targetId]
    if (!source || !target) return
    // Whichever widget sits higher on the canvas becomes the parent —
    // no picker, the drop position alone decides the relation.
    const sourceCenterY = source.position.y + source.size.height / 2
    const targetCenterY = target.position.y + target.size.height / 2
    const [parentId, childId] =
      sourceCenterY <= targetCenterY
        ? [linkDrag.sourceId, targetId]
        : [targetId, linkDrag.sourceId]
    state.addRelation(parentId, childId, 'parent')
  },

  childLinkSource: null,
  startChildLink: (sourceId) =>
    set((state) => (
      state.childLinkSource === sourceId && state.dependencyLinkSource === null
        ? state
        : { childLinkSource: sourceId, dependencyLinkSource: null }
    )),
  clearChildLink: () =>
    set((state) => (state.childLinkSource === null ? state : { childLinkSource: null })),

  dependencyLinkSource: null,
  startDependencyLink: (sourceId) =>
    set((state) => (
      state.dependencyLinkSource === sourceId && state.childLinkSource === null
        ? state
        : { dependencyLinkSource: sourceId, childLinkSource: null }
    )),
  clearDependencyLink: () =>
    set((state) => (state.dependencyLinkSource === null ? state : { dependencyLinkSource: null })),

  ghostConfig: null,

  startGhostShaper: (worldX, worldY) => {
    ghostGestureState.base = null
    ghostGestureIds.clear()
    const originX = snapToGrid(worldX)
    const originY = snapToGrid(worldY)
    set({
      ghostConfig: {
        isActive: true,
        originX,
        originY,
        nodes: [{ id: crypto.randomUUID(), parentId: null, order: 0, x: originX, y: originY, widgetTypes: [] }],
      },
    })
  },

  beginGhostGesture: () => {
    const config = get().ghostConfig
    ghostGestureState.base = config?.nodes.map((node) => ({ ...node, widgetTypes: [...node.widgetTypes] })) ?? null
    ghostGestureIds.clear()
  },

  shapeGhostTree: (nodeId, direction, steps) => {
    const config = get().ghostConfig
    const base = ghostGestureState.base ?? config?.nodes
    if (!config || !base?.some((node) => node.id === nodeId)) return
    let nodes = base.map((candidate) => ({ ...candidate }))
    if (steps === 0) {
      set({ ghostConfig: { ...config, nodes: layoutGhostTree(nodes, config.originX, config.originY) } })
      return
    }
    const removeSubtree = (rootId: string) => {
      const remove = new Set([rootId])
      for (let cursor = 0; cursor < nodes.length; cursor++) {
        const candidate = nodes[cursor]!
        if (candidate.parentId && remove.has(candidate.parentId)) remove.add(candidate.id)
      }
      nodes = nodes.filter((candidate) => !remove.has(candidate.id))
    }

    if (direction === 'down') {
      let parent = nodes.find((candidate) => candidate.id === nodeId)
      while (parent) {
        const center = nodes.find((candidate) => candidate.parentId === parent!.id && candidate.order === 0)
        if (!center) break
        parent = center
      }
      for (let step = 0; step < steps && parent; step++) {
        const child: GhostTreeNode = {
          id: gestureGhostId(`down:${nodeId}:${step}`),
          parentId: parent.id,
          order: 0,
          x: parent.x,
          y: parent.y + GHOST_PITCH_Y,
          widgetTypes: [],
        }
        nodes.push(child)
        parent = child
      }
    } else if (direction === 'up') {
      for (let step = 0; step < steps; step++) {
        const reference = nodes.find((candidate) => candidate.id === nodeId)
        if (!reference) break
        let frontier = nodes.filter((candidate) => candidate.parentId === reference.id)
        let deepest: GhostTreeNode | undefined
        while (frontier.length > 0) {
          deepest = frontier.sort((a, b) => Math.abs(b.order) - Math.abs(a.order))[0]
          frontier = nodes.filter((candidate) => candidate.parentId === deepest!.id)
        }
        if (deepest) removeSubtree(deepest.id)
        else if (reference.parentId) removeSubtree(reference.id)
      }
    } else {
      const reference = nodes.find((candidate) => candidate.id === nodeId)
      if (!reference) return
      const gestureSide = direction === 'left' ? -1 : 1
      const outward = reference.order === 0 || Math.sign(reference.order) === gestureSide
      // Inward motion edits the side the grabbed node actually belongs to;
      // using cursor direction here would delete the opposite sibling set.
      const side = outward ? gestureSide : Math.sign(reference.order)
      const siblingParentId = reference.parentId
      for (let step = 0; step < steps; step++) {
        const siblings = nodes.filter((candidate) => candidate.parentId === siblingParentId)
        const onSide = siblings.filter((candidate) => Math.sign(candidate.order) === side)
        if (outward) {
          if (onSide.length >= GHOST_SIBLINGS_PER_SIDE_MAX) break
          const order = side < 0
            ? Math.min(0, ...onSide.map((candidate) => candidate.order)) - 1
            : Math.max(0, ...onSide.map((candidate) => candidate.order)) + 1
          nodes.push({
            id: gestureGhostId(`side:${siblingParentId ?? 'root'}:${order}`),
            parentId: siblingParentId,
            order,
            x: reference.x,
            y: reference.parentId ? reference.y : config.originY,
            widgetTypes: [],
          })
        } else {
          const outermost = onSide.sort((a, b) => Math.abs(b.order) - Math.abs(a.order))[0]
          if (!outermost) break
          removeSubtree(outermost.id)
        }
      }
    }

    nodes = layoutGhostTree(nodes, config.originX, config.originY)
    set({ ghostConfig: { ...config, nodes } })
  },

  endGhostGesture: () => {
    ghostGestureState.base = null
    ghostGestureIds.clear()
  },

  setGhostNodeWidgetTypes: (nodeId, widgetTypes) => {
    const uniqueTypes = [...new Set(widgetTypes)] as ModuleType[]
    set((state) => {
      const config = state.ghostConfig
      if (!config) return state
      const node = config.nodes.find((candidate) => candidate.id === nodeId)
      if (!node) return state
      if (
        node.widgetTypes.length === uniqueTypes.length &&
        node.widgetTypes.every((type, index) => type === uniqueTypes[index])
      ) return state
      const nodes = config.nodes.map((candidate) =>
        candidate.id === nodeId ? { ...candidate, widgetTypes: uniqueTypes } : candidate,
      )
      return {
        ghostConfig: {
          ...config,
          nodes: layoutGhostTree(nodes, config.originX, config.originY),
        },
      }
    })
  },

  cancelGhostShaper: () =>
    set((state) => {
      ghostGestureState.base = null
      ghostGestureIds.clear()
      return state.ghostConfig === null ? state : { ghostConfig: null }
    }),

  commitGhostTree: () => {
    const state = get()
    const config = state.ghostConfig
    if (!config) return
    const { originX, originY, nodes } = config
    if (nodes.some((node) => node.widgetTypes.length === 0)) return
    pushHistory()

    let widgets = { ...state.widgets }
    const relations = { ...state.relations }
    const groups: Record<string, WidgetGroup> = { ...state.groups }
    const created: string[] = []
    const settleIds = new Set<string>()
    const relationKeys = new Set(
      Object.values(relations).map((relation) =>
        relationKey(relation.fromId, relation.toId, relation.type),
      ),
    )
    const createWidgetForNode = (type: ModuleType, position: Vector2D) => {
      const id = crypto.randomUUID()
      widgets[id] = buildWidget(id, type, MODULE_LABELS[type], state.activeCanvasId, position)
      created.push(id)
      settleIds.add(id)
      return id
    }

    const ids = new Map<string, string[]>()
    const groupIds = new Map<string, string>()
    const relationIds = new Map<string, string>()
    for (const node of nodes) {
      const position = {
        x: originX + (node.x - originX) * 3,
        y: originY + (node.y - originY) * 2.5,
      }
      const nodeIds = node.widgetTypes.map((type) => createWidgetForNode(type, position))
      ids.set(node.id, nodeIds)
      if (nodeIds.length > 1) {
        widgets = applyWidgetPositions(widgets, compactGroupPositions(widgets, nodeIds))
        const groupId = crypto.randomUUID()
        groups[groupId] = {
          id: groupId,
          label: 'Tree bundle',
          widgetIds: nodeIds,
          color: nextGroupColor(),
        }
        groupIds.set(node.id, groupId)
      }
    }
    for (const node of nodes) {
      if (node.parentId) {
        const parentId = ids.get(node.parentId)?.[0]
        const childId = ids.get(node.id)?.[0]
        if (parentId && childId) {
          const relationId = appendDraftRelation(
            widgets,
            relations,
            relationKeys,
            settleIds,
            parentId,
            childId,
            'parent',
          )
          if (relationId) relationIds.set(node.id, relationId)
        }
      }
    }

    const widgetGroupIndex = buildGroupIndex(groups)
    registerTreeReveal(buildTreeRevealSchedule(
      [...nodes]
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((node) => ({
          widgetIds: ids.get(node.id) ?? [],
          groupId: groupIds.get(node.id),
          relationId: relationIds.get(node.id),
        })),
    ))

    set({
      widgets: settleWidgetsByCanvas(widgets, settleIds, widgetGroupIndex),
      widgetStructureVersion: state.widgetStructureVersion + 1,
      relations,
      groups,
      widgetGroupIndex,
      blockedWidgetIds: computeBlockedWidgetIds(relations),
      selectedIds: new Set(created),
      ghostConfig: null,
    })
  },
  }
}
