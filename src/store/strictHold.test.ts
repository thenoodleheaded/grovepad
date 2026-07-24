import { afterEach, describe, expect, it } from 'vitest'
import { makeRelation, makeWidget } from '../test/factories'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useWidgetStore } from './useWidgetStore'
import { expandMovedWidgetIds, strictCarrierIds, strictHolderOf } from './widgetGraph'

// ---------------------------------------------------------------------------
// Pure derivation — hand-built records, no store.
// ---------------------------------------------------------------------------

function record<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]))
}

const noGlue = { glues: {}, widgetGlueIndex: {} }

describe('strict-hold derivation', () => {
  it('a soft parent moves alone: no relation ever moves anyone by itself', () => {
    const widgets = record([makeWidget({ id: 'p' }), makeWidget({ id: 'c' })])
    const relations = record([makeRelation({ id: 'r1', fromId: 'p', toId: 'c' })])
    expect(expandMovedWidgetIds(['p'], { widgets, relations, ...noGlue })).toEqual(['p'])
    expect(strictCarrierIds(widgets, relations).size).toBe(0)
  })

  it('a strict holder carries its whole parent-linked subtree', () => {
    const widgets = record([
      makeWidget({ id: 'p', metadata: { badges: [], strictHold: true } }),
      makeWidget({ id: 'c' }),
      makeWidget({ id: 'g' }),
    ])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'p', toId: 'c' }),
      makeRelation({ id: 'r2', fromId: 'c', toId: 'g' }),
    ])
    expect(expandMovedWidgetIds(['p'], { widgets, relations, ...noGlue }).sort()).toEqual(['c', 'g', 'p'])
  })

  it('strictness is inherited downward: a soft child inside a held tree still carries its own branch', () => {
    const widgets = record([
      makeWidget({ id: 'root', metadata: { badges: [], strictHold: true } }),
      makeWidget({ id: 'mid' }),
      makeWidget({ id: 'leaf' }),
    ])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'root', toId: 'mid' }),
      makeRelation({ id: 'r2', fromId: 'mid', toId: 'leaf' }),
    ])
    // Dragging the middle node carries its branch but never its holder above.
    expect(expandMovedWidgetIds(['mid'], { widgets, relations, ...noGlue }).sort()).toEqual(['leaf', 'mid'])
  })

  it('a free node above a deep holder is untouched by strictness below it', () => {
    const widgets = record([
      makeWidget({ id: 'top' }),
      makeWidget({ id: 'holder', metadata: { badges: [], strictHold: true } }),
      makeWidget({ id: 'leaf' }),
    ])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'top', toId: 'holder' }),
      makeRelation({ id: 'r2', fromId: 'holder', toId: 'leaf' }),
    ])
    expect(expandMovedWidgetIds(['top'], { widgets, relations, ...noGlue })).toEqual(['top'])
    expect(expandMovedWidgetIds(['holder'], { widgets, relations, ...noGlue }).sort()).toEqual(['holder', 'leaf'])
  })

  it('only non-parent relation types never couple movement', () => {
    const widgets = record([
      makeWidget({ id: 'p', metadata: { badges: [], strictHold: true } }),
      makeWidget({ id: 'c' }),
    ])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'p', toId: 'c', type: 'cousin' }),
    ])
    expect(expandMovedWidgetIds(['p'], { widgets, relations, ...noGlue })).toEqual(['p'])
  })

  it('survives parent cycles without hanging and moves the loop as one', () => {
    const widgets = record([
      makeWidget({ id: 'a', metadata: { badges: [], strictHold: true } }),
      makeWidget({ id: 'b' }),
    ])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'a', toId: 'b' }),
      makeRelation({ id: 'r2', fromId: 'b', toId: 'a' }),
    ])
    expect(expandMovedWidgetIds(['a'], { widgets, relations, ...noGlue }).sort()).toEqual(['a', 'b'])
    expect(strictHolderOf('b', widgets, relations)).toBe('a')
  })

  it('family expansion never crosses canvases', () => {
    const widgets = record([
      makeWidget({ id: 'p', metadata: { badges: [], strictHold: true } }),
      makeWidget({ id: 'c', canvasId: 'other' }),
    ])
    const relations = record([makeRelation({ id: 'r1', fromId: 'p', toId: 'c' })])
    expect(expandMovedWidgetIds(['p'], { widgets, relations, ...noGlue })).toEqual(['p'])
  })

  it('interleaves glue and family to a fixpoint: a strict child welded to a stranger pulls the cluster', () => {
    const widgets = record([
      makeWidget({ id: 'p', metadata: { badges: [], strictHold: true } }),
      makeWidget({ id: 'c' }),
      makeWidget({ id: 'stranger' }),
    ])
    const relations = record([makeRelation({ id: 'r1', fromId: 'p', toId: 'c' })])
    const glues = { g1: { id: 'g1', widgetIds: ['c', 'stranger'] } }
    const widgetGlueIndex = { c: 'g1', stranger: 'g1' }
    expect(
      expandMovedWidgetIds(['p'], {
        widgets,
        relations,
        glues: glues as never,
        widgetGlueIndex,
      }).sort(),
    ).toEqual(['c', 'p', 'stranger'])
  })

  it('names the nearest strict holder above a widget, and none for a free one', () => {
    const widgets = record([
      makeWidget({ id: 'root', metadata: { badges: [], strictHold: true } }),
      makeWidget({ id: 'mid' }),
      makeWidget({ id: 'leaf' }),
      makeWidget({ id: 'free' }),
    ])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'root', toId: 'mid' }),
      makeRelation({ id: 'r2', fromId: 'mid', toId: 'leaf' }),
    ])
    expect(strictHolderOf('leaf', widgets, relations)).toBe('root')
    expect(strictHolderOf('root', widgets, relations)).toBeNull()
    expect(strictHolderOf('free', widgets, relations)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Store integration — the drag path and persistence round trip.
// ---------------------------------------------------------------------------

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

describe('strict hold in the store', () => {
  function createFamily() {
    const store = useWidgetStore.getState()
    const parentId = store.createWidget('Parent', { x: 0, y: 800 }, 'notes')
    const childId = store.createWidget('Child', { x: 1200, y: 0 }, 'notes')
    useWidgetStore.getState().addRelation(parentId, childId, 'parent')
    return { parentId, childId }
  }

  it('soft by default: dragging the parent leaves the child where it is', () => {
    const { parentId, childId } = createFamily()
    const childBefore = useWidgetStore.getState().widgets[childId]!.position
    useWidgetStore.getState().moveWidget(parentId, { x: 80, y: 40 }, 1)
    expect(useWidgetStore.getState().widgets[childId]!.position).toEqual(childBefore)
  })

  it('a strict hold drags the child by the same delta as the parent', () => {
    const { parentId, childId } = createFamily()
    useWidgetStore.getState().updateWidgetsMetadata([parentId], { strictHold: true })
    const childBefore = useWidgetStore.getState().widgets[childId]!.position
    useWidgetStore.getState().moveWidget(parentId, { x: 80, y: 40 }, 1)
    expect(useWidgetStore.getState().widgets[childId]!.position).toEqual({
      x: childBefore.x + 80,
      y: childBefore.y + 40,
    })
  })

  it('option-drag breaks the coupling for that drag without touching the relation', () => {
    const { parentId, childId } = createFamily()
    useWidgetStore.getState().updateWidgetsMetadata([parentId], { strictHold: true })
    const childBefore = useWidgetStore.getState().widgets[childId]!.position
    useWidgetStore.getState().moveWidget(parentId, { x: 80, y: 0 }, 1, { soloGlued: true, moveSelection: false })
    expect(useWidgetStore.getState().widgets[childId]!.position).toEqual(childBefore)
    expect(
      Object.values(useWidgetStore.getState().relations).some(
        (rel) => rel.fromId === parentId && rel.toId === childId && rel.type === 'parent',
      ),
    ).toBe(true)
  })

  it('a locked child stays put even inside a strict family', () => {
    const { parentId, childId } = createFamily()
    useWidgetStore.getState().updateWidgetsMetadata([parentId], { strictHold: true })
    useWidgetStore.getState().updateWidgetsMetadata([childId], { locked: true })
    const childBefore = useWidgetStore.getState().widgets[childId]!.position
    useWidgetStore.getState().moveWidget(parentId, { x: 80, y: 40 }, 1)
    expect(useWidgetStore.getState().widgets[childId]!.position).toEqual(childBefore)
  })

  it('the strict flag survives the exported-board validation round trip', () => {
    const { parentId } = createFamily()
    useWidgetStore.getState().updateWidgetsMetadata([parentId], { strictHold: true })
    const parsed = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))
    expect(parsed?.widgets[parentId]?.metadata.strictHold).toBe(true)
  })
})
