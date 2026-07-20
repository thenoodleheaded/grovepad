import { afterEach, describe, expect, it } from 'vitest'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useWidgetStore } from './useWidgetStore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

function createNotes(count: number): string[] {
  const store = useWidgetStore.getState()
  return Array.from({ length: count }, (_, index) =>
    store.createWidget(`Group test ${index + 1}`, { x: 20_000 + index * 1_200, y: 20_000 }, 'notes'),
  )
}

function groupsContaining(widgetId: string): string[] {
  return Object.values(useWidgetStore.getState().groups)
    .filter((group) => group.widgetIds.includes(widgetId))
    .map((group) => group.id)
}

describe('widget groups', () => {
  it('creates one-canvas groups with unique, existing members', () => {
    const [a, b] = createNotes(2)
    const groupId = useWidgetStore.getState().createGroup([a!, a!, 'missing', b!], 'Pair')

    expect(groupId).not.toBe('')
    expect(useWidgetStore.getState().groups[groupId]?.widgetIds).toEqual([a, b])
    expect(useWidgetStore.getState().widgetGroupIndex).toMatchObject({ [a!]: groupId, [b!]: groupId })
  })

  it('rejects groups and transfers that would cross canvases', () => {
    const [a, b] = createNotes(2)
    const groupId = useWidgetStore.getState().createGroup([a!, b!], 'Local')
    const otherWorkspaceId = useWidgetStore.getState().createWorkspace('Other grouping canvas')
    useWidgetStore.getState().switchWorkspace(otherWorkspaceId)
    const [remote] = createNotes(1)
    const groupsBefore = useWidgetStore.getState().groups

    expect(useWidgetStore.getState().createGroup([a!, remote!], 'Invalid')).toBe('')
    useWidgetStore.getState().addToGroup(groupId, remote!)
    useWidgetStore.getState().joinGroup(groupId, remote!)

    expect(useWidgetStore.getState().groups).toBe(groupsBefore)
    expect(useWidgetStore.getState().widgetGroupIndex[remote!]).toBeUndefined()
  })

  it('moves a widget between groups without duplicate membership and undoes the drag atomically', () => {
    const [a, b, c, d] = createNotes(4)
    const sourceId = useWidgetStore.getState().createGroup([a!, b!], 'Source')
    const targetId = useWidgetStore.getState().createGroup([c!, d!], 'Target')
    const before = useWidgetStore.getState().groups

    // WidgetCard captures this at the first drag movement; joinGroup belongs
    // to the same undo step as the pointer move.
    useWidgetStore.getState().snapshotHistory('group-drag')
    useWidgetStore.getState().joinGroup(targetId, a!)

    expect(useWidgetStore.getState().groups[sourceId]).toBeUndefined()
    expect(useWidgetStore.getState().groups[targetId]?.widgetIds).toEqual([c, d, a])
    expect(groupsContaining(a!)).toEqual([targetId])
    expect(useWidgetStore.getState().widgetGroupIndex[a!]).toBe(targetId)
    expect(useWidgetStore.getState().widgetGroupIndex[b!]).toBeUndefined()

    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().groups).toEqual(before)
    useWidgetStore.getState().redo()
    expect(groupsContaining(a!)).toEqual([targetId])
  })

  it('uses addToGroup as a reversible cross-group transfer', () => {
    const [a, b, c, d, e] = createNotes(5)
    const sourceId = useWidgetStore.getState().createGroup([a!, b!, c!], 'Source')
    const targetId = useWidgetStore.getState().createGroup([d!, e!], 'Target')

    useWidgetStore.getState().addToGroup(targetId, a!)

    expect(useWidgetStore.getState().groups[sourceId]?.widgetIds).toEqual([b, c])
    expect(useWidgetStore.getState().groups[targetId]?.widgetIds).toEqual([d, e, a])
    expect(groupsContaining(a!)).toEqual([targetId])
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().groups[sourceId]?.widgetIds).toEqual([a, b, c])
    expect(useWidgetStore.getState().groups[targetId]?.widgetIds).toEqual([d, e])
  })

  it('renames, moves, tightens, detaches, and dissolves through undoable actions', () => {
    const [a, b, c] = createNotes(3)
    const groupId = useWidgetStore.getState().createGroup([a!, b!, c!], 'Original')

    useWidgetStore.getState().renameGroup(groupId, 'Renamed')
    expect(useWidgetStore.getState().groups[groupId]?.label).toBe('Renamed')
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().groups[groupId]?.label).toBe('Original')

    const beforeMove = Object.fromEntries(
      [a!, b!, c!].map((id) => [id, useWidgetStore.getState().widgets[id]!.position]),
    )
    useWidgetStore.getState().snapshotHistory('group-move')
    useWidgetStore.getState().moveGroup(groupId, { x: 80, y: 40 }, 2)
    for (const id of [a!, b!, c!]) {
      const before = beforeMove[id]!
      expect(useWidgetStore.getState().widgets[id]!.position).toEqual({ x: before.x + 40, y: before.y + 20 })
    }
    useWidgetStore.getState().undo()
    for (const id of [a!, b!, c!]) {
      expect(useWidgetStore.getState().widgets[id]!.position).toEqual(beforeMove[id])
    }

    useWidgetStore.setState((state) => ({
      widgets: {
        ...state.widgets,
        [a!]: { ...state.widgets[a!]!, position: { x: 0, y: 0 } },
        [b!]: { ...state.widgets[b!]!, position: { x: 8_000, y: 8_000 } },
        [c!]: { ...state.widgets[c!]!, position: { x: 16_000, y: 16_000 } },
      },
    }))
    useWidgetStore.getState().compactGroup(groupId)
    const compacted = [a!, b!, c!].map((id) => useWidgetStore.getState().widgets[id]!.position)
    expect(Math.max(...compacted.map((position) => position.x)) - Math.min(...compacted.map((position) => position.x))).toBeLessThan(2_000)
    expect(Math.max(...compacted.map((position) => position.y)) - Math.min(...compacted.map((position) => position.y))).toBeLessThan(2_000)
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets[c!]!.position).toEqual({ x: 16_000, y: 16_000 })

    useWidgetStore.getState().removeFromGroup(groupId, a!)
    expect(useWidgetStore.getState().groups[groupId]?.widgetIds).toEqual([b, c])
    expect(useWidgetStore.getState().widgetGroupIndex[a!]).toBeUndefined()
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().groups[groupId]?.widgetIds).toEqual([a, b, c])

    useWidgetStore.getState().dissolveGroup(groupId)
    expect(useWidgetStore.getState().groups[groupId]).toBeUndefined()
    expect(useWidgetStore.getState().widgetGroupIndex[a!]).toBeUndefined()
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().groups[groupId]?.widgetIds).toEqual([a, b, c])
  })

  it('settles one dragged member without moving or repacking its siblings', () => {
    const [a, b, c] = createNotes(3)
    useWidgetStore.getState().createGroup([a!, b!, c!], 'Free arrangement')
    useWidgetStore.setState((state) => ({
      widgets: {
        ...state.widgets,
        [a!]: { ...state.widgets[a!]!, position: { x: 20_013, y: 20_027 } },
        [b!]: { ...state.widgets[b!]!, position: { x: 23_200, y: 20_000 } },
        [c!]: { ...state.widgets[c!]!, position: { x: 26_400, y: 20_000 } },
      },
    }))
    const beforeB = useWidgetStore.getState().widgets[b!]!.position
    const beforeC = useWidgetStore.getState().widgets[c!]!.position

    useWidgetStore.getState().selectWidget(a!, false)
    useWidgetStore.getState().selectWidget(b!, true)
    useWidgetStore.getState().moveWidget(a!, { x: 40, y: 0 }, 1, { moveSelection: false })
    useWidgetStore.getState().settleWidgets([a!])

    expect(useWidgetStore.getState().widgets[a!]!.position).toEqual({ x: 20_040, y: 20_040 })
    expect(useWidgetStore.getState().widgets[b!]!.position).toEqual(beforeB)
    expect(useWidgetStore.getState().widgets[c!]!.position).toEqual(beforeC)
  })

  it('preserves the cursor-selected position when a drag detaches a member', () => {
    const [a, b, c] = createNotes(3)
    const groupId = useWidgetStore.getState().createGroup([a!, b!, c!], 'Drag detach')
    const dropPosition = { x: 31_120, y: 27_440 }
    useWidgetStore.setState((state) => ({
      widgets: {
        ...state.widgets,
        [a!]: { ...state.widgets[a!]!, position: dropPosition },
      },
    }))

    useWidgetStore.getState().removeFromGroup(groupId, a!, { preservePosition: true })

    expect(useWidgetStore.getState().widgetGroupIndex[a!]).toBeUndefined()
    expect(useWidgetStore.getState().widgets[a!]!.position).toEqual(dropPosition)
    expect(useWidgetStore.getState().groups[groupId]?.widgetIds).toEqual([b, c])
  })

  it('ignores missing widgets in every membership path', () => {
    const [a, b] = createNotes(2)
    const groupId = useWidgetStore.getState().createGroup([a!, b!])
    const before = useWidgetStore.getState().groups

    useWidgetStore.getState().addToGroup(groupId, 'missing')
    useWidgetStore.getState().joinGroup(groupId, 'missing')
    useWidgetStore.getState().removeFromGroup(groupId, 'missing')

    expect(useWidgetStore.getState().groups).toBe(before)
  })

  it('keeps multi-group toolbar actions inside one undo step', () => {
    const [a, b, c, d, e, f] = createNotes(6)
    const firstGroupId = useWidgetStore.getState().createGroup([a!, b!, c!], 'First')
    const secondGroupId = useWidgetStore.getState().createGroup([d!, e!, f!], 'Second')
    useWidgetStore.setState((state) => ({
      widgets: {
        ...state.widgets,
        [a!]: { ...state.widgets[a!]!, position: { x: 0, y: 0 } },
        [b!]: { ...state.widgets[b!]!, position: { x: 8_000, y: 8_000 } },
        [c!]: { ...state.widgets[c!]!, position: { x: 16_000, y: 16_000 } },
        [d!]: { ...state.widgets[d!]!, position: { x: 24_000, y: 0 } },
        [e!]: { ...state.widgets[e!]!, position: { x: 32_000, y: 8_000 } },
        [f!]: { ...state.widgets[f!]!, position: { x: 40_000, y: 16_000 } },
      },
    }))

    let historyCaptured = false
    for (const groupId of [firstGroupId, secondGroupId]) {
      const changed = useWidgetStore.getState().compactGroup(groupId, { skipHistory: historyCaptured })
      if (changed) historyCaptured = true
    }
    expect(useWidgetStore.getState().widgets[c!]!.position).not.toEqual({ x: 16_000, y: 16_000 })
    expect(useWidgetStore.getState().widgets[f!]!.position).not.toEqual({ x: 40_000, y: 16_000 })
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets[c!]!.position).toEqual({ x: 16_000, y: 16_000 })
    expect(useWidgetStore.getState().widgets[f!]!.position).toEqual({ x: 40_000, y: 16_000 })

    historyCaptured = false
    for (const [groupId, widgetId] of [[firstGroupId, a!], [secondGroupId, d!]] as const) {
      const changed = useWidgetStore.getState().removeFromGroup(groupId, widgetId, {
        skipHistory: historyCaptured,
      })
      if (changed) historyCaptured = true
    }
    expect(useWidgetStore.getState().widgetGroupIndex[a!]).toBeUndefined()
    expect(useWidgetStore.getState().widgetGroupIndex[d!]).toBeUndefined()
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgetGroupIndex[a!]).toBe(firstGroupId)
    expect(useWidgetStore.getState().widgetGroupIndex[d!]).toBe(secondGroupId)
  })
})
