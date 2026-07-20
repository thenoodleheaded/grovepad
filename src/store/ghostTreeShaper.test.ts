import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useWidgetStore } from './useWidgetStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

describe('ghost tree widget bundles', () => {
  it('keeps creation blocked until every tree point has a widget selection', () => {
    const before = new Set(Object.keys(useWidgetStore.getState().widgets))
    useWidgetStore.getState().startGhostShaper(20_000, 20_000)
    useWidgetStore.getState().commitGhostTree()

    expect(useWidgetStore.getState().ghostConfig).not.toBeNull()
    expect(new Set(Object.keys(useWidgetStore.getState().widgets))).toEqual(before)
  })

  it('creates selected widgets, a compact multi-widget group, and one parent relation atomically', () => {
    const beforeWidgetIds = new Set(Object.keys(useWidgetStore.getState().widgets))
    const beforeGroupIds = new Set(Object.keys(useWidgetStore.getState().groups))
    const beforeRelationIds = new Set(Object.keys(useWidgetStore.getState().relations))

    useWidgetStore.getState().startGhostShaper(24_000, 24_000)
    const rootId = useWidgetStore.getState().ghostConfig!.nodes[0]!.id
    useWidgetStore.getState().setGhostNodeWidgetTypes(rootId, ['notes', 'checklist'])
    useWidgetStore.getState().beginGhostGesture()
    useWidgetStore.getState().shapeGhostTree(rootId, 'down', 1)
    useWidgetStore.getState().endGhostGesture()
    const childId = useWidgetStore.getState().ghostConfig!.nodes.find((node) => node.parentId === rootId)!.id
    useWidgetStore.getState().setGhostNodeWidgetTypes(childId, ['flashcards'])
    useWidgetStore.getState().commitGhostTree()

    const state = useWidgetStore.getState()
    const created = Object.values(state.widgets).filter((widget) => !beforeWidgetIds.has(widget.id))
    const createdGroups = Object.values(state.groups).filter((group) => !beforeGroupIds.has(group.id))
    const createdRelations = Object.values(state.relations).filter((relation) => !beforeRelationIds.has(relation.id))

    expect(created.map((widget) => widget.type).sort()).toEqual(['checklist', 'flashcards', 'notes'])
    expect(createdGroups).toHaveLength(1)
    expect(createdGroups[0]?.widgetIds).toHaveLength(2)
    expect(createdRelations).toHaveLength(1)
    expect(createdRelations[0]?.type).toBe('parent')
    expect(state.selectedIds).toEqual(new Set(created.map((widget) => widget.id)))
    expect(state.ghostConfig).toBeNull()

    useWidgetStore.getState().undo()
    for (const widget of created) expect(useWidgetStore.getState().widgets[widget.id]).toBeUndefined()
    expect(useWidgetStore.getState().groups[createdGroups[0]!.id]).toBeUndefined()
    expect(useWidgetStore.getState().relations[createdRelations[0]!.id]).toBeUndefined()
  })

  it('grows root siblings sideways and lets each root shape its own branch', () => {
    useWidgetStore.getState().startGhostShaper(28_000, 28_000)
    const originalRootId = useWidgetStore.getState().ghostConfig!.nodes[0]!.id

    useWidgetStore.getState().beginGhostGesture()
    useWidgetStore.getState().shapeGhostTree(originalRootId, 'right', 2)
    useWidgetStore.getState().endGhostGesture()

    const roots = useWidgetStore.getState().ghostConfig!.nodes
      .filter((node) => node.parentId === null)
      .sort((a, b) => a.order - b.order)
    expect(roots.map((node) => node.order)).toEqual([0, 1, 2])
    expect(new Set(roots.map((node) => node.y))).toEqual(new Set([28_000]))

    const siblingRoot = roots[1]!
    useWidgetStore.getState().beginGhostGesture()
    useWidgetStore.getState().shapeGhostTree(siblingRoot.id, 'down', 1)
    useWidgetStore.getState().endGhostGesture()

    const branch = useWidgetStore.getState().ghostConfig!.nodes.find(
      (node) => node.parentId === siblingRoot.id,
    )
    expect(branch).toBeDefined()
    expect(branch!.y).toBeGreaterThan(siblingRoot.y)
  })
})
