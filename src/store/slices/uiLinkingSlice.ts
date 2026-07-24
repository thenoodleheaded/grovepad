import type { GhostTreeNode, ModuleType, SearchResult, Vector2D } from '../../types/spatial'
import { GHOST_PITCH_Y, GHOST_SIBLINGS_PER_SIDE_MAX, ICONIFIED_SIZE, MODULE_LABELS, snapToGrid } from '../../types/spatial'
import { ghostGestureIds, ghostGestureState, gestureGhostId, layoutGhostTree } from '../widgetGhostLayout'
import { computeBlockedWidgetIds } from '../widgetGraph'
import { appendDraftRelation, relationKey } from '../widgetRelationDrafts'
import { buildWidget, fuzzyScore } from '../widgetSizing'
import { settleWidgetsByCanvas } from '../widgetSettling'
import { layoutCommittedTree } from '../treeCommitLayout'
import { buildTreeRevealSchedule, registerTreeReveal } from '../treeReveal'
import { relationDropEndpoints, usesStrictRelations } from '../../utils/relationPolicy'
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

  importMindmap: (widgets, relations) => {
    pushHistory()
    set((state) => {
      const nextWidgets = { ...state.widgets, ...widgets }

      const nextRelations = { ...state.relations }
      relations.forEach((r) => {
        nextRelations[r.id] = r
      })

      return {
        widgets: nextWidgets,
        widgetStructureVersion: state.widgetStructureVersion + 1,
        relations: nextRelations,
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
    const strict = usesStrictRelations(state.canvases[source.canvasId])
    const [fromId, toId] = relationDropEndpoints(source, target, strict)
    state.addRelation(fromId, toId, 'parent')
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
      ghostSelectedNodeIds: new Set(),
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

  addWidgetTypesToGhostNodes: (nodeIds, widgetTypes) => {
    const targetIds = new Set(nodeIds)
    set((state) => {
      const config = state.ghostConfig
      if (!config) return state
      let changed = false
      const nodes = config.nodes.map((candidate) => {
        if (!targetIds.has(candidate.id)) return candidate
        const merged = [...new Set([...candidate.widgetTypes, ...widgetTypes])] as ModuleType[]
        if (
          merged.length === candidate.widgetTypes.length &&
          candidate.widgetTypes.every((type, index) => type === merged[index])
        ) return candidate
        changed = true
        return { ...candidate, widgetTypes: merged }
      })
      if (!changed) return state
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
      return state.ghostConfig === null
        ? state
        : { ghostConfig: null, ghostSelectedNodeIds: new Set() }
    }),

  ghostSelectedNodeIds: new Set(),

  toggleGhostNodeSelected: (nodeId) => {
    set((state) => {
      const next = new Set(state.ghostSelectedNodeIds)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return { ghostSelectedNodeIds: next }
    })
  },

  addGhostNodesToSelection: (nodeIds) => {
    set((state) => {
      const next = new Set(state.ghostSelectedNodeIds)
      for (const id of nodeIds) next.add(id)
      if (next.size === state.ghostSelectedNodeIds.size) return state
      return { ghostSelectedNodeIds: next }
    })
  },

  clearGhostNodeSelection: () =>
    set((state) => (state.ghostSelectedNodeIds.size === 0 ? state : { ghostSelectedNodeIds: new Set() })),

  commitGhostTree: () => {
    const state = get()
    const config = state.ghostConfig
    if (!config) return
    const { originX, originY, nodes } = config
    if (nodes.some((node) => node.widgetTypes.length === 0)) return
    pushHistory()

    let widgets = { ...state.widgets }
    const relations = { ...state.relations }
    const created: string[] = []
    const settleIds = new Set<string>()
    const relationKeys = new Set(
      Object.values(relations).map((relation) =>
        relationKey(relation.fromId, relation.toId, relation.type),
      ),
    )
    // Every committed widget spawns in the icon scale state — the same 2×2
    // tile the ghost preview drew, so the board the commit reveals is the
    // board the user shaped. A new widget holds no real information yet;
    // opening one (click) restores its full card, and once info is in it the
    // widget lives the ordinary resting-face life: face with content, icon
    // when empty. This is presentation, not data — some types (rating,
    // number) have a legitimate zero-value face, so "start as an icon" can
    // only be the user-authored icon state, never faked-empty data.
    const createWidgetForNode = (type: ModuleType, position: Vector2D) => {
      const id = crypto.randomUUID()
      const built = buildWidget(id, type, MODULE_LABELS[type], state.activeCanvasId, position)
      widgets[id] = {
        ...built,
        iconified: true,
        expandedSize: built.size,
        size: { ...ICONIFIED_SIZE },
      }
      created.push(id)
      settleIds.add(id)
      return id
    }

    // Lay the forest out from the sizes the widgets will actually occupy.
    // The ghost preview is drawn from icon tiles, so its coordinates cannot
    // say how much room the committed board needs; the previous fixed
    // multipliers guessed, bundles overlapped, and overlap-settling then
    // scattered the whole tree while only ever guaranteeing "not touching".
    // Every spawned widget is an icon tile, so every node packs at icon size.
    const placements = new Map(
      layoutCommittedTree(
        nodes.map((node) => ({
          id: node.id,
          parentId: node.parentId,
          order: node.order,
          widgetSizes: node.widgetTypes.map(() => ICONIFIED_SIZE),
        })),
        originX,
        originY,
      ).map((placement) => [placement.nodeId, placement.widgetPositions]),
    )

    const ids = new Map<string, string[]>()
    const relationIds = new Map<string, string>()
    for (const node of nodes) {
      const positions = placements.get(node.id) ?? []
      const nodeIds = node.widgetTypes.map((type, index) =>
        createWidgetForNode(type, positions[index] ?? { x: originX, y: originY }),
      )
      ids.set(node.id, nodeIds)
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
            usesStrictRelations(state.canvases[widgets[parentId]!.canvasId]),
          )
          if (relationId) relationIds.set(node.id, relationId)
        }
      }
    }

    registerTreeReveal(buildTreeRevealSchedule(
      [...nodes]
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((node) => ({
          widgetIds: ids.get(node.id) ?? [],
          relationId: relationIds.get(node.id),
        })),
    ))

    set({
      widgets: settleWidgetsByCanvas(widgets, settleIds),
      widgetStructureVersion: state.widgetStructureVersion + 1,
      relations,
      blockedWidgetIds: computeBlockedWidgetIds(relations),
      selectedIds: new Set(created),
      ghostConfig: null,
      ghostSelectedNodeIds: new Set(),
    })
  },
  }
}
