import { describe, expect, it } from 'vitest'
import { GRID_SIZE } from '../types/spatial'
import type { Widget, WidgetGroup } from '../types/spatial'
import { untangleCanvasLayout, useWidgetStore } from './useWidgetStore'

const UNTANGLE_GAP = GRID_SIZE * 2

/** Force a widget straight to an exact position/size, bypassing snapping logic. */
function place(id: string, x: number, y: number, width: number, height: number): void {
  useWidgetStore.setState((state) => {
    const widget = state.widgets[id]
    if (!widget) return state
    return { widgets: { ...state.widgets, [id]: { ...widget, position: { x, y }, size: { width, height } } } }
  })
}

function widgetAt(id: string): Widget {
  const widget = useWidgetStore.getState().widgets[id]
  if (!widget) throw new Error(`missing widget ${id}`)
  return widget
}

/** Horizontal gap between two rects that are separated on the x axis. */
function xGap(a: Widget, b: Widget): number {
  return a.position.x <= b.position.x
    ? b.position.x - (a.position.x + a.size.width)
    : a.position.x - (b.position.x + b.size.width)
}

describe('untangleCanvas', () => {
  it('leaves exactly UNTANGLE_GAP (2 grid cells) between two overlapping widgets', () => {
    const store = useWidgetStore.getState()
    const canvasId = store.activeCanvasId
    // Placed far from the seed board's own widgets — untangleCanvasLayout
    // clusters EVERY widget on the canvas, so a rect anywhere near existing
    // content would join the relaxation and confound the exact math below.
    const OX = 100_000
    const OY = 100_000
    const aId = store.createWidget('A', { x: OX, y: OY }, 'notes')
    const bId = store.createWidget('B', { x: OX, y: OY }, 'notes')

    // An overlap of 120px (an ODD multiple of GRID_SIZE=40) is exactly the
    // case that used to drift: splitting 120 in half (60) is not itself a
    // grid multiple, so snapping each side independently could inflate the
    // final gap past exactly 80px. Widths/heights are always grid multiples
    // in this app, so 200x120 is representative of real widget geometry.
    place(aId, OX, OY, 200, 120)
    place(bId, OX + 160, OY + 40, 200, 120)

    useWidgetStore.getState().untangleCanvas()

    const a = widgetAt(aId)
    const b = widgetAt(bId)
    expect(a.canvasId).toBe(canvasId)
    expect(xGap(a, b)).toBe(UNTANGLE_GAP)
    // Both final positions must land back on the grid (avoid strict -0 !== 0).
    expect(Math.abs(a.position.x % GRID_SIZE)).toBe(0)
    expect(Math.abs(b.position.x % GRID_SIZE)).toBe(0)

    useWidgetStore.getState().deleteWidgets([aId, bId])
  })

  it('leaves exactly UNTANGLE_GAP between two rigid groups treated as clusters', () => {
    // Calls untangleCanvasLayout directly (not the untangleCanvas() store
    // action) so the group's own internal compaction pass — a separate,
    // unrelated concern — can't confound the geometry under test.
    const store = useWidgetStore.getState()
    const canvasId = store.activeCanvasId
    // Far from the seed board and from the previous test's coordinates —
    // see the note in the first test for why isolation matters here.
    const OX = 200_000
    const OY = 200_000
    const a1 = store.createWidget('A1', { x: OX, y: OY }, 'notes')
    const a2 = store.createWidget('A2', { x: OX, y: OY }, 'notes')
    const b1 = store.createWidget('B1', { x: OX, y: OY }, 'notes')
    const b2 = store.createWidget('B2', { x: OX, y: OY }, 'notes')

    place(a1, OX, OY, 160, 120)
    place(a2, OX, OY + 120, 160, 120)
    // Group A's bounding box is x:[OX,OX+160] y:[OY,OY+240].
    place(b1, OX + 120, OY, 160, 120)
    place(b2, OX + 120, OY + 120, 160, 120)
    // Group B's bounding box is x:[OX+120,OX+280] y:[OY,OY+240] — overlaps A
    // by 40px in x, an overlap that becomes an ODD cell count once the gap is
    // folded in (120 + 80 = 200 = 5 cells) — the case that used to drift.

    const groupA: WidgetGroup = { id: crypto.randomUUID(), label: 'A', widgetIds: [a1, a2], color: '#6366f1' }
    const groupB: WidgetGroup = { id: crypto.randomUUID(), label: 'B', widgetIds: [b1, b2], color: '#8b5cf6' }
    const groups = { [groupA.id]: groupA, [groupB.id]: groupB }

    const untangled = untangleCanvasLayout(useWidgetStore.getState().widgets, groups, canvasId)

    const groupBoundsX = (ids: string[]) => {
      const widgets = ids.map((id) => untangled[id]!)
      return {
        min: Math.min(...widgets.map((w) => w.position.x)),
        max: Math.max(...widgets.map((w) => w.position.x + w.size.width)),
      }
    }
    const boundsA = groupBoundsX([a1, a2])
    const boundsB = groupBoundsX([b1, b2])
    const gap = boundsA.max <= boundsB.min ? boundsB.min - boundsA.max : boundsA.min - boundsB.max
    expect(gap).toBe(UNTANGLE_GAP)
    // Each group's two members must still be exactly stacked — the cluster
    // translated as a rigid unit, internal layout untouched.
    expect(untangled[a2]!.position.x).toBe(untangled[a1]!.position.x)
    expect(untangled[b2]!.position.x).toBe(untangled[b1]!.position.x)

    useWidgetStore.getState().deleteWidgets([a1, a2, b1, b2])
  })

  it('no longer exposes arrangeWidgets', () => {
    expect('arrangeWidgets' in useWidgetStore.getState()).toBe(false)
  })
})
