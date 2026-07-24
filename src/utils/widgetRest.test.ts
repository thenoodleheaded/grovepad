import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import { GRID_SIZE, ICON_MIN_EDGE } from '../types/spatial'
import { useWidgetRestStore } from '../store/useWidgetRestStore'
import { WIDGET_REGISTRY } from '../widgets/registry'
import {
  effectiveWidgetSize,
  expansionOffsetFor,
  isWidgetRestExpanded,
  isWidgetResting,
  restExpansionOffset,
  restingTileSize,
  widgetWithEffectiveSize,
} from './widgetRest'

function makeWidget(overrides: Partial<Widget> = {}): Widget {
  return {
    id: 'w1',
    type: 'line_chart',
    title: 'Trend',
    canvasId: 'c1',
    position: { x: 0, y: 0 },
    size: { width: 400, height: 240 },
    data: { title: 'Trend', unit: '', points: [] },
    metadata: {},
    ...overrides,
  } as Widget
}

const idleCtx = { expandedWidgetId: null }

describe('resting decision', () => {
  it('defaults every registered widget type to an energy-light resting face', () => {
    for (const definition of Object.values(WIDGET_REGISTRY)) {
      expect(definition.restingFace, definition.type).not.toBe(false)
      expect(isWidgetResting(makeWidget({ type: definition.type }), idleCtx), definition.type).toBe(true)
    }
  })

  it('rests a widget at idle', () => {
    expect(isWidgetResting(makeWidget(), idleCtx)).toBe(true)
  })

  it('yields to a user-authored icon state', () => {
    expect(isWidgetResting(makeWidget({ iconified: true }), idleCtx)).toBe(false)
  })

  it('stays full only for the single expanded slot', () => {
    // Group membership is no longer a reason to skip resting — a member rests
    // and expands exactly like a standalone widget (the plate hugs whatever
    // footprint it shows). Only being the expanded slot keeps a card full.
    expect(isWidgetResting(makeWidget(), { ...idleCtx, expandedWidgetId: 'w1' })).toBe(false)
    // Another widget being expanded does not affect this one.
    expect(isWidgetResting(makeWidget(), { ...idleCtx, expandedWidgetId: 'other' })).toBe(true)
  })
})

describe('effective size', () => {
  it('substitutes the content-derived face tile while resting', () => {
    // An empty line chart has nothing to show, so it rests as a bare icon —
    // at the 2x2 floor every icon-shaped thing obeys, never a single cell.
    const widget = makeWidget()
    const tile = restingTileSize(widget)
    expect(tile).toEqual({ width: ICON_MIN_EDGE, height: ICON_MIN_EDGE })
    expect(effectiveWidgetSize(widget, true)).toEqual(tile)
    expect(effectiveWidgetSize(widget, false)).toEqual(widget.size)
  })

  it('sizes to the half-cell lattice when there is content', () => {
    const widget = makeWidget({
      type: 'checklist',
      data: { items: [{ id: 'a', label: 'Write the plan', done: false }] },
    })
    const tile = restingTileSize(widget)
    expect(tile.width % 20).toBe(0)
    expect(tile.height % 20).toBe(0)
    expect(tile.height).toBeLessThanOrEqual(GRID_SIZE * 2)
  })

  it('leaves the stored record untouched when substituting', () => {
    const widget = makeWidget()
    const effective = widgetWithEffectiveSize(widget, idleCtx)
    expect(effective).not.toBe(widget)
    expect(widget.size).toEqual({ width: 400, height: 240 })
    expect(widget.position).toEqual({ x: 0, y: 0 })
  })

  it('returns the stored record itself when nothing is substituted', () => {
    // A widget the resting system does not govern costs no allocation.
    const pinned = makeWidget({ iconified: true })
    expect(widgetWithEffectiveSize(pinned, { ...idleCtx, expandedWidgetId: 'w1' })).toBe(pinned)
  })
})

describe('pinned', () => {
  const pinned = () => makeWidget({ metadata: { badges: [], pinned: true } })

  it('holds a widget open through every other widget’s expansion', () => {
    expect(isWidgetResting(pinned(), idleCtx)).toBe(false)
    expect(isWidgetResting(pinned(), { ...idleCtx, expandedWidgetId: 'other' })).toBe(false)
  })

  it('keeps its stored footprint exactly — it is not the expanded member', () => {
    // A permanent state must draw where its saved position says, so a pinned
    // card takes neither the centre-anchored offset nor the lifted stacking
    // order, even while it is the id in the rest store.
    const widget = pinned()
    const ctx = { ...idleCtx, expandedWidgetId: 'w1' }
    expect(isWidgetRestExpanded(widget, ctx)).toBe(false)
    expect(restExpansionOffset(widget, ctx)).toEqual({ x: 0, y: 0 })
    expect(widgetWithEffectiveSize(widget, ctx)).toBe(widget)
  })
})

describe('centre-anchored expansion', () => {
  it('opens a card centred on the tile it replaces', () => {
    const widget = makeWidget()
    const tile = restingTileSize(widget)
    const offset = expansionOffsetFor(tile, widget.size)
    expect(offset).toEqual({
      x: (tile.width - widget.size.width) / 2,
      y: (tile.height - widget.size.height) / 2,
    })
    // The tile's centre is exactly where the full card's centre lands, which
    // is what keeps the pressed thing under the pointer.
    const expanded = widgetWithEffectiveSize(widget, {
      ...idleCtx,
      expandedWidgetId: 'w1',
      expandedOffset: offset,
    })
    expect(expanded.position.x + widget.size.width / 2).toBe(
      widget.position.x + tile.width / 2,
    )
    expect(expanded.position.y + widget.size.height / 2).toBe(
      widget.position.y + tile.height / 2,
    )
  })

  it('holds the opening offset still while the open card is resized', () => {
    // Re-deriving the offset from the live size moved the card by half of
    // every size change, so dragging one side grew both and the card scaled
    // out of its own centre. The captured offset must survive a resize.
    const widget = makeWidget()
    const offset = expansionOffsetFor(restingTileSize(widget), widget.size)
    const ctx = { ...idleCtx, expandedWidgetId: 'w1', expandedOffset: offset }
    const grown = makeWidget({ size: { width: 900, height: 700 } })
    expect(restExpansionOffset(grown, ctx)).toEqual(offset)
    // The left edge therefore stays put: only the stored position can move it.
    expect(widgetWithEffectiveSize(grown, ctx).position)
      .toEqual(widgetWithEffectiveSize(widget, ctx).position)
  })

  it('does not offset resting, pinned, or icon widgets', () => {
    const widget = makeWidget()
    const offset = { x: -50, y: -50 }
    expect(restExpansionOffset(widget, idleCtx)).toEqual({ x: 0, y: 0 })
    expect(restExpansionOffset(widget, { ...idleCtx, expandedWidgetId: 'other', expandedOffset: offset })).toEqual({ x: 0, y: 0 })
    // A pinned card is held open at its stored box, never as the expanded slot.
    expect(restExpansionOffset(makeWidget({ metadata: { badges: [], pinned: true } }), { ...idleCtx, expandedWidgetId: 'w1', expandedOffset: offset })).toEqual({ x: 0, y: 0 })
    expect(
      restExpansionOffset(makeWidget({ iconified: true }), { ...idleCtx, expandedWidgetId: 'w1', expandedOffset: offset }),
    ).toEqual({ x: 0, y: 0 })
  })

  it('reads a stale expanded id against the widget’s real state', () => {
    // The id outlives a card that has since been iconified: it must stop
    // counting as expanded, or it keeps the lifted stacking order.
    const ctx = { ...idleCtx, expandedWidgetId: 'w1' }
    expect(isWidgetRestExpanded(makeWidget(), ctx)).toBe(true)
    expect(isWidgetRestExpanded(makeWidget({ iconified: true }), ctx)).toBe(false)
    expect(isWidgetRestExpanded(makeWidget({ metadata: { badges: [], pinned: true } }), ctx)).toBe(false)
  })
})

describe('rest store', () => {
  it('is an accordion: expanding replaces, collapsing clears', () => {
    const store = useWidgetRestStore.getState()
    store.expandWidget('a')
    expect(useWidgetRestStore.getState().expandedWidgetId).toBe('a')
    store.expandWidget('b')
    expect(useWidgetRestStore.getState().expandedWidgetId).toBe('b')
    store.collapseWidget()
    expect(useWidgetRestStore.getState().expandedWidgetId).toBe(null)
  })

  it('remembers the state a card expanded from, and forgets it on collapse', () => {
    const store = useWidgetRestStore.getState()
    // Default origin is the resting tile — its size re-derives from content.
    store.expandWidget('a', { x: 0, y: 0 })
    expect(useWidgetRestStore.getState().expandedFrom).toEqual({ kind: 'rest' })
    // An icon origin carries the exact square it was opened from.
    store.expandWidget('b', { x: 0, y: 0 }, { kind: 'icon', size: { width: 120, height: 120 } })
    expect(useWidgetRestStore.getState().expandedFrom).toEqual({
      kind: 'icon',
      size: { width: 120, height: 120 },
    })
    store.collapseWidget()
    expect(useWidgetRestStore.getState().expandedFrom).toBe(null)
  })
})

describe('folding an open card back onto its original spot', () => {
  it('absorbs a resize into the offset and forgets it on collapse', () => {
    const store = useWidgetRestStore.getState()
    store.expandWidget('w1', { x: -140, y: -80 })
    // A left-edge drag grew the card by 200: the offset pays for it, so the
    // right edge holds still on screen.
    store.nudgeExpandedOffset({ x: -200, y: 0 })
    expect(useWidgetRestStore.getState().expandedOffset).toEqual({ x: -340, y: -80 })

    useWidgetRestStore.getState().collapseWidget()
    // Every trace of the adjustment is gone, so the resting tile draws at the
    // stored anchor — the exact spot the card was opened from.
    expect(useWidgetRestStore.getState().expandedOffset).toEqual({ x: 0, y: 0 })
    expect(useWidgetRestStore.getState().expandedWidgetId).toBe(null)
  })

  it('ignores a nudge when nothing is open', () => {
    useWidgetRestStore.getState().collapseWidget()
    useWidgetRestStore.getState().nudgeExpandedOffset({ x: 50, y: 50 })
    expect(useWidgetRestStore.getState().expandedOffset).toEqual({ x: 0, y: 0 })
  })
})
