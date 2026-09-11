import { afterEach, describe, expect, it } from 'vitest'
import { makeRelation, makeWidget } from '../test/factories'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { enforceGenerationFloor, GENERATION_GAP } from './generationFloor'
import { useWidgetStore } from './useWidgetStore'

// ---------------------------------------------------------------------------
// The rule itself — hand-built records, no store.
// ---------------------------------------------------------------------------

function record<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]))
}

function boxes(entries: Array<{ id: string; y: number; height?: number }>) {
  return record(
    entries.map(({ id, y, height = 100 }) =>
      makeWidget({ id, position: { x: 0, y }, size: { width: 200, height } }),
    ),
  )
}

describe('the generation floor', () => {
  it('drops a child that sits above its parent to a full generation below it', () => {
    const widgets = boxes([{ id: 'parent', y: 500 }, { id: 'child', y: 0 }])
    const relations = record([makeRelation({ id: 'r1', fromId: 'parent', toId: 'child' })])
    const next = enforceGenerationFloor(widgets, relations)
    // The parent never moves — only the child does, and only downward. Boxes are
    // measured at their resting footprint, so the assertion is the rule itself
    // rather than an arithmetic re-derivation of the tile sizes.
    expect(next.parent!.position.y).toBe(500)
    expect(next.child!.position.y).toBeGreaterThanOrEqual(500 + GENERATION_GAP)
  })

  it('leaves a family that already reads top-down exactly where it is', () => {
    const widgets = boxes([{ id: 'parent', y: 0 }, { id: 'child', y: 400 }])
    const relations = record([makeRelation({ id: 'r1', fromId: 'parent', toId: 'child' })])
    // Same record back: nothing is ever pulled UP, and callers rely on the
    // reference check to skip a pointless commit.
    expect(enforceGenerationFloor(widgets, relations)).toBe(widgets)
  })

  it('never moves a card sideways', () => {
    const widgets = record([
      makeWidget({ id: 'parent', position: { x: 0, y: 500 }, size: { width: 200, height: 100 } }),
      makeWidget({ id: 'child', position: { x: 900, y: 0 }, size: { width: 200, height: 100 } }),
    ])
    const relations = record([makeRelation({ id: 'r1', fromId: 'parent', toId: 'child' })])
    expect(enforceGenerationFloor(widgets, relations).child!.position.x).toBe(900)
  })

  it('carries the whole branch down, keeping the shape under the pushed node', () => {
    const widgets = boxes([
      { id: 'parent', y: 500 },
      { id: 'child', y: 0 },
      { id: 'grandchild', y: 300 },
    ])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'parent', toId: 'child' }),
      makeRelation({ id: 'r2', fromId: 'child', toId: 'grandchild' }),
    ])
    const next = enforceGenerationFloor(widgets, relations)
    const shift = next.child!.position.y - 0
    expect(next.grandchild!.position.y).toBe(300 + shift)
  })

  it('measures a glue cluster as one node and moves it whole', () => {
    const widgets = boxes([
      { id: 'parent', y: 500 },
      { id: 'welded-top', y: 0 },
      { id: 'welded-bottom', y: 112 },
    ])
    const relations = record([makeRelation({ id: 'r1', fromId: 'parent', toId: 'welded-top' })])
    const glueIndex = { 'welded-top': 'g1', 'welded-bottom': 'g1' }
    const next = enforceGenerationFloor(widgets, relations, glueIndex)
    // The weld survives: both members shifted by the same distance.
    expect(next['welded-bottom']!.position.y - next['welded-top']!.position.y).toBe(112)
    expect(next['welded-top']!.position.y).toBeGreaterThanOrEqual(500 + GENERATION_GAP)
  })

  it('holds a locked child where it is', () => {
    const widgets = {
      ...boxes([{ id: 'parent', y: 500 }]),
      child: makeWidget({
        id: 'child',
        position: { x: 0, y: 0 },
        size: { width: 200, height: 100 },
        metadata: { badges: [], locked: true },
      }),
    }
    const relations = record([makeRelation({ id: 'r1', fromId: 'parent', toId: 'child' })])
    expect(enforceGenerationFloor(widgets, relations)).toBe(widgets)
  })

  it('says nothing about a link that crosses canvases', () => {
    const widgets = {
      ...boxes([{ id: 'parent', y: 500 }]),
      child: makeWidget({ id: 'child', canvasId: 'other', position: { x: 0, y: 0 } }),
    }
    const relations = record([makeRelation({ id: 'r1', fromId: 'parent', toId: 'child' })])
    expect(enforceGenerationFloor(widgets, relations)).toBe(widgets)
  })

  it('says nothing about relations that are not parenthood', () => {
    const widgets = boxes([{ id: 'a', y: 500 }, { id: 'b', y: 0 }])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'a', toId: 'b', type: 'cousin' }),
      makeRelation({ id: 'r2', fromId: 'a', toId: 'b', type: 'blocker' }),
    ])
    expect(enforceGenerationFloor(widgets, relations)).toBe(widgets)
  })

  it('terminates on a parent cycle instead of hanging', () => {
    const widgets = boxes([{ id: 'a', y: 0 }, { id: 'b', y: 0 }])
    const relations = record([
      makeRelation({ id: 'r1', fromId: 'a', toId: 'b' }),
      makeRelation({ id: 'r2', fromId: 'b', toId: 'a' }),
    ])
    expect(() => enforceGenerationFloor(widgets, relations)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// The drop — the rule reaching the board through the store.
// ---------------------------------------------------------------------------

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  useWidgetStore.getState().loadBoard(baseline)
})

describe('the generation floor at the drop', () => {
  it('settles a child that was dragged above its parent back underneath it', () => {
    const store = useWidgetStore.getState()
    const parentId = store.createWidget('Parent', { x: 0, y: 1200 }, 'text')
    const childId = store.createWidget('Child', { x: 1200, y: 1200 }, 'text')
    useWidgetStore.getState().addRelation(parentId, childId, 'parent')

    // Dragging is free-form while the pointer is down: the card really does go
    // above its parent. ⌥ (soloGlued) so the family coupling does not carry the
    // parent along with it.
    useWidgetStore.getState().moveWidget(childId, { x: 0, y: -2000 }, 1, {
      soloGlued: true,
      moveSelection: false,
    })
    expect(useWidgetStore.getState().widgets[childId]!.position.y).toBeLessThan(
      useWidgetStore.getState().widgets[parentId]!.position.y,
    )

    useWidgetStore.getState().settleWidgets([childId])

    const after = useWidgetStore.getState()
    expect(after.widgets[childId]!.position.y).toBeGreaterThan(
      after.widgets[parentId]!.position.y + GENERATION_GAP,
    )
  })
})
