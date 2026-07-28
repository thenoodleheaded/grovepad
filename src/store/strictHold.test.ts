import { readFileSync } from 'node:fs'
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

  it('asks the one owner whether the decision is already owned above', () => {
    expect(menu).toContain('strictHolderOf(contextMenu.widgetId, state.widgets, state.relations)')
  })

  it('offers no switch inside a held tree — it names the holder, disabled', () => {
    // The law: strictness is inherited downward and owned at the top, so a node
    // already held cannot be softened here. The row must be inert, or the menu
    // would promise a change the rules discard.
    expect(menu).toContain('heldByTitle !== null ? (')
    const heldRow = menu.slice(menu.indexOf('heldByTitle !== null ? ('), menu.indexOf(') : hasFamily ? ('))
    expect(heldRow).toContain('Held strictly by ')
    expect(heldRow).toContain('disabled')
    expect(heldRow).not.toContain('updateWidgetsMetadata')
  })

  it('toggles both ways for a free parent, through the metadata owner', () => {
    // Nothing about a hold is a one-way door: a holder that owns its own
    // decision can always release it.
    expect(menu).toContain("strictHold ? 'Release strict hold' : 'Hold family strictly'")
    expect(menu).toContain('updateWidgetsMetadata([widget.id], { strictHold: !strictHold })')
  })

  it('stays hidden for a widget with no family to hold', () => {
    expect(menu).toContain("relation.type === 'parent' && relation.fromId === contextMenu.widgetId")
    expect(menu).toContain(') : hasFamily ? (')
  })
})
