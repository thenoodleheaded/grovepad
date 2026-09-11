import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { makeRelation, makeWidget } from '../test/factories'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useWidgetStore } from './useWidgetStore'
import { expandMovedWidgetIds, resolveStrictHold, strictCarrierIds } from './widgetGraph'

// ---------------------------------------------------------------------------
// Pure derivation — hand-built records, no store.
// ---------------------------------------------------------------------------

function record<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]))
}

const noGlue = { glues: {}, widgetGlueIndex: {} }

describe('strict-hold derivation', () => {
  it('hard by default: a plain parent line already carries the child', () => {
    const widgets = record([makeWidget({ id: 'p' }), makeWidget({ id: 'c' })])
    const relations = record([makeRelation({ id: 'r1', fromId: 'p', toId: 'c' })])
    expect(expandMovedWidgetIds(['p'], { widgets, relations, ...noGlue }).sort()).toEqual(['c', 'p'])
    expect(strictCarrierIds(widgets, relations).size).toBe(2)
  })

  it('a released parent moves alone, and the release reaches its whole branch', () => {
    const widgets = record([
      makeWidget({ id: 'p', metadata: { badges: [], strictHold: false } }),
      makeWidget({ id: 'c' }),
      makeWidget({ id: 'g' }),
    ])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'p', toId: 'c' }),
      makeRelation({ id: 'r2', fromId: 'c', toId: 'g' }),
    ])
    expect(expandMovedWidgetIds(['p'], { widgets, relations, ...noGlue })).toEqual(['p'])
    // The release is inherited downward exactly as a hold is: no hard pockets
    // hiding inside a branch somebody deliberately relaxed.
    expect(expandMovedWidgetIds(['c'], { widgets, relations, ...noGlue })).toEqual(['c'])
    expect(resolveStrictHold('g', widgets, relations)).toEqual({ strict: false, inheritedFrom: 'p' })
  })

  it('a node re-holds its own branch inside a released tree', () => {
    const widgets = record([
      makeWidget({ id: 'p', metadata: { badges: [], strictHold: false } }),
      makeWidget({ id: 'c', metadata: { badges: [], strictHold: true } }),
      makeWidget({ id: 'g' }),
    ])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'p', toId: 'c' }),
      makeRelation({ id: 'r2', fromId: 'c', toId: 'g' }),
    ])
    expect(expandMovedWidgetIds(['p'], { widgets, relations, ...noGlue })).toEqual(['p'])
    expect(expandMovedWidgetIds(['c'], { widgets, relations, ...noGlue }).sort()).toEqual(['c', 'g'])
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

  it('a released node above a holder keeps its own release', () => {
    const widgets = record([
      makeWidget({ id: 'top', metadata: { badges: [], strictHold: false } }),
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
    expect(resolveStrictHold('b', widgets, relations).strict).toBe(true)
  })

  it('resolves a cycle of undecided nodes to the default instead of hanging', () => {
    const widgets = record([makeWidget({ id: 'a' }), makeWidget({ id: 'b' })])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'a', toId: 'b' }),
      makeRelation({ id: 'r2', fromId: 'b', toId: 'a' }),
    ])
    expect(resolveStrictHold('a', widgets, relations)).toEqual({ strict: true, inheritedFrom: null })
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

  it("names where an inherited answer was decided, and nothing for a node's own", () => {
    const widgets = record([
      makeWidget({ id: 'root', metadata: { badges: [], strictHold: false } }),
      makeWidget({ id: 'mid' }),
      makeWidget({ id: 'leaf' }),
      makeWidget({ id: 'free' }),
    ])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'root', toId: 'mid' }),
      makeRelation({ id: 'r2', fromId: 'mid', toId: 'leaf' }),
    ])
    expect(resolveStrictHold('leaf', widgets, relations).inheritedFrom).toBe('root')
    expect(resolveStrictHold('root', widgets, relations)).toEqual({ strict: false, inheritedFrom: null })
    // Nobody decided anything for a lone card: hard, and nothing to name.
    expect(resolveStrictHold('free', widgets, relations)).toEqual({ strict: true, inheritedFrom: null })
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
    const parentId = store.createWidget('Parent', { x: 0, y: 800 }, 'text')
    const childId = store.createWidget('Child', { x: 1200, y: 0 }, 'text')
    useWidgetStore.getState().addRelation(parentId, childId, 'parent')
    return { parentId, childId }
  }

  it('hard by default: dragging the parent drags the child, nothing switched on', () => {
    const { parentId, childId } = createFamily()
    const childBefore = useWidgetStore.getState().widgets[childId]!.position
    useWidgetStore.getState().moveWidget(parentId, { x: 80, y: 40 }, 1)
    expect(useWidgetStore.getState().widgets[childId]!.position).toEqual({
      x: childBefore.x + 80,
      y: childBefore.y + 40,
    })
  })

  it('a released parent leaves the child where it is', () => {
    const { parentId, childId } = createFamily()
    useWidgetStore.getState().updateWidgetsMetadata([parentId], { strictHold: false })
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

  it('a keyboard nudge carries the strict family too, and keeps the distance it moved', () => {
    // The strict-hold law names expandMovedWidgetIds the single owner of what
    // moves together — "store moves, release settling, and the displacement
    // preview must all pass through it". A nudge is a store move: without the
    // closure the family stays behind, and without anchoring the nudge the
    // settle grid-snaps the card straight back to where it started.
    const { parentId, childId } = createFamily()
    useWidgetStore.getState().updateWidgetsMetadata([parentId], { strictHold: true })
    useWidgetStore.getState().selectWidget(parentId, false)
    const parentBefore = useWidgetStore.getState().widgets[parentId]!.position
    const childBefore = useWidgetStore.getState().widgets[childId]!.position

    useWidgetStore.getState().nudgeSelection(1, 0)

    const after = useWidgetStore.getState()
    expect(after.widgets[parentId]!.position.x).toBe(parentBefore.x + 1)
    expect(after.widgets[childId]!.position).toEqual({ x: childBefore.x + 1, y: childBefore.y })
  })

  it('a nudge of nothing but locked widgets moves nothing and leaves no undo step', () => {
    // The locked filter can empty the move, and the history snapshot is taken
    // before the store is touched — so the order matters: an undo entry that
    // undoes nothing is worse than no entry at all.
    const { parentId, childId } = createFamily()
    useWidgetStore.getState().updateWidgetsMetadata([parentId], { locked: true })

    // A real edit first, under a DIFFERENT history tag — nudges coalesce with
    // each other, so only an unrelated action exposes a stray nudge entry.
    const titleBefore = useWidgetStore.getState().widgets[childId]!.title
    useWidgetStore.getState().updateWidgetTitle(childId, 'Renamed')
    expect(useWidgetStore.getState().widgets[childId]!.title).toBe('Renamed')

    // Now nudge a selection of nothing but locked widgets: it moves nothing.
    useWidgetStore.getState().selectWidget(parentId, false)
    const lockedBefore = { ...useWidgetStore.getState().widgets[parentId]!.position }
    useWidgetStore.getState().nudgeSelection(40, 0)
    expect(useWidgetStore.getState().widgets[parentId]!.position).toEqual(lockedBefore)

    // One undo must reach the rename. If the no-op nudge had recorded a history
    // entry, this undo would spend itself restoring nothing.
    useWidgetStore.getState().undo()
    expect(useWidgetStore.getState().widgets[childId]!.title).toBe(titleBefore)
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

// ---------------------------------------------------------------------------
// The switch a person actually reaches for. There is no DOM test environment
// here, so the menu's ownership rules are guarded at the source.
// ---------------------------------------------------------------------------

describe("the widget menu's soft/hard switch", () => {
  const menu = readFileSync(
    new URL('../components/ui/WidgetContextMenu.tsx', import.meta.url),
    'utf8',
  )

  it('asks the one owner for the resolved answer, never the raw flag', () => {
    // Hard-by-default means `metadata.strictHold` is usually absent, so reading
    // the flag directly would draw every node as released.
    expect(menu).toContain('resolveStrictHold(contextMenu.widgetId, state.widgets, state.relations)')
    expect(menu).not.toContain('widget.metadata.strictHold')
  })

  it('always switches — every node owns the hold on its own branch', () => {
    // Nothing about a hold is a one-way door, and with hard as the default the
    // release must be reachable at the node a person right-clicked, not only at
    // the top of the tree.
    expect(menu).toContain("? 'Release strict hold'")
    expect(menu).toContain(": 'Hold family strictly'")
    expect(menu).toContain('updateWidgetsMetadata([widget.id], { strictHold: !strictHold })')
    // The inert "held from above" row belongs to the old opt-in law.
    expect(menu).not.toContain('Held strictly by')
  })

  it('names where a released answer came from when the node did not decide it', () => {
    expect(menu).toContain('releasedByTitle !== null')
    expect(menu).toContain('released by ')
  })

  it('stays hidden for a widget with no family to hold', () => {
    expect(menu).toContain("relation.type === 'parent' && relation.fromId === contextMenu.widgetId")
    expect(menu).toContain('{hasFamily ? (')
  })

  it('is the only surface carrying the switch — a relation line never offers it', () => {
    // A hold belongs to the parent node and reaches every descendant inheriting
    // from it. Offering it on one edge reads as "glue these two", a promise the
    // rules do not keep.
    const lines = readFileSync(
      new URL('../components/canvas/RelationLines.tsx', import.meta.url),
      'utf8',
    )
    expect(lines).not.toContain('strictHold')
    expect(lines).not.toContain('strictHolderOf')
  })
})
