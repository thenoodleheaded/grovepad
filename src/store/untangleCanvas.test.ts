import { describe, expect, it } from 'vitest'
import { GRID_SIZE } from '../types/spatial'
import type { Widget, WidgetGlue } from '../types/spatial'
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

  it('untangles only the requested widgets and leaves the rest of the canvas still', () => {
    const store = useWidgetStore.getState()
    const OX = 150_000
    const OY = 150_000
    const aId = store.createWidget('Selected A', { x: OX, y: OY }, 'notes')
    const bId = store.createWidget('Selected B', { x: OX, y: OY }, 'notes')
    const untouchedId = store.createWidget('Untouched', { x: OX, y: OY }, 'notes')

    place(aId, OX, OY, 200, 120)
    place(bId, OX + 160, OY + 40, 200, 120)
    place(untouchedId, OX + 40, OY + 40, 200, 120)
    const untouchedBefore = widgetAt(untouchedId).position

    useWidgetStore.getState().untangleWidgets([aId, bId])

    expect(xGap(widgetAt(aId), widgetAt(bId))).toBe(UNTANGLE_GAP)
    expect(widgetAt(untouchedId).position).toEqual(untouchedBefore)

    useWidgetStore.getState().deleteWidgets([aId, bId, untouchedId])
  })

  it('leaves exactly UNTANGLE_GAP between two rigid glue clusters', () => {
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

    const glueA: WidgetGlue = { id: crypto.randomUUID(), widgetIds: [a1, a2] }
    const glueB: WidgetGlue = { id: crypto.randomUUID(), widgetIds: [b1, b2] }
    const glues = { [glueA.id]: glueA, [glueB.id]: glueB }

    const untangled = untangleCanvasLayout(useWidgetStore.getState().widgets, glues, canvasId)

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
    // Each cluster's two members must still be exactly stacked — the cluster
    // translated as a rigid unit, internal layout untouched.
    expect(untangled[a2]!.position.x).toBe(untangled[a1]!.position.x)
    expect(untangled[b2]!.position.x).toBe(untangled[b1]!.position.x)

    useWidgetStore.getState().deleteWidgets([a1, a2, b1, b2])
  })

  it('no longer exposes arrangeWidgets', () => {
    expect('arrangeWidgets' in useWidgetStore.getState()).toBe(false)
  })
})

/**
 * The Untangle button's other half. Separation alone can only ever push things
 * apart, so a tree that had drifted into a sprawl stayed sprawled; compaction
 * pulls a selected parent-linked family back into an exact 2-cell lattice.
 */
describe('untangleWidgets compacts selected trees', () => {
  const GAP = GRID_SIZE * 2

  /** A parent → child tree of plain notes, all placed far from real content. */
  function tree(origin: number, shape: readonly { x: number; y: number }[]) {
    const store = useWidgetStore.getState()
    const ids = shape.map((_, index) =>
      store.createWidget(`T${origin}-${index}`, { x: origin, y: origin }, 'notes'),
    )
    ids.forEach((id, index) => {
      place(id, origin + shape[index]!.x, origin + shape[index]!.y, 160, 120)
    })
    return ids
  }

  function link(parentId: string, childId: string) {
    useWidgetStore.getState().addRelation(parentId, childId, 'parent')
  }

  it('leaves exactly 2 cells between siblings and between generations', () => {
    const O = 300_000
    // A root with two children, all three scattered: the children are far below
    // the root and far apart from each other, which is what untangle alone
    // could never fix.
    const [root, left, right] = tree(O, [
      { x: 0, y: 0 },
      { x: -1200, y: 900 },
      { x: 1600, y: 1300 },
    ]) as [string, string, string]
    link(root, left)
    link(root, right)

    useWidgetStore.getState().untangleWidgets([root, left, right])

    const r = widgetAt(root)
    const l = widgetAt(left)
    const g = widgetAt(right)
    // Siblings: exactly 2 cells apart, sharing one baseline.
    expect(xGap(l, g)).toBe(GAP)
    expect(l.position.y).toBe(g.position.y)
    // Generations: exactly 2 cells under the parent's bottom edge.
    expect(l.position.y - (r.position.y + r.size.height)).toBe(GAP)
    // The root held its place and the branches came to it.
    expect(r.position).toEqual({ x: O, y: O })
    // The parent sits centred over the span its children occupy.
    const childSpan = (l.position.x + g.position.x + g.size.width) / 2
    expect(r.position.x + r.size.width / 2).toBe(childSpan)
    // Everything lands back on the grid.
    for (const w of [r, l, g]) {
      expect(Math.abs(w.position.x % GRID_SIZE)).toBe(0)
      expect(Math.abs(w.position.y % GRID_SIZE)).toBe(0)
    }

    useWidgetStore.getState().deleteWidgets([root, left, right])
  })

  it('keeps whole branches clear of each other rather than interleaving them', () => {
    const O = 400_000
    const [root, a, b, aChild] = tree(O, [
      { x: 0, y: 0 },
      { x: 0, y: 2000 },
      { x: 800, y: 2000 },
      { x: -2000, y: 4000 },
    ]) as [string, string, string, string]
    link(root, a)
    link(root, b)
    link(a, aChild)

    useWidgetStore.getState().untangleWidgets([root, a, b, aChild])

    const branchA = widgetAt(a)
    const branchB = widgetAt(b)
    const child = widgetAt(aChild)
    // A's subtree reserves its own width, so B never lands over A's child.
    expect(xGap(branchA, branchB)).toBeGreaterThanOrEqual(GAP)
    expect(child.position.x + child.size.width).toBeLessThanOrEqual(branchB.position.x - GAP)
    // Three generations, each exactly 2 cells under the one above.
    expect(branchA.position.y - (widgetAt(root).position.y + 120)).toBe(GAP)
    expect(child.position.y - (branchA.position.y + 120)).toBe(GAP)

    useWidgetStore.getState().deleteWidgets([root, a, b, aChild])
  })

  it('compacts a tree without pulling in an unrelated selected widget', () => {
    const O = 500_000
    const [root, child, loner] = tree(O, [
      { x: 0, y: 0 },
      { x: 900, y: 700 },
      { x: 3000, y: 0 },
    ]) as [string, string, string]
    link(root, child)
    const lonerBefore = widgetAt(loner).position

    useWidgetStore.getState().untangleWidgets([root, child, loner])

    expect(widgetAt(child).position.y - (widgetAt(root).position.y + 120)).toBe(GAP)
    // Nothing overlapped it, so the widget that is not part of the tree stayed
    // exactly where it was.
    expect(widgetAt(loner).position).toEqual(lonerBefore)

    useWidgetStore.getState().deleteWidgets([root, child, loner])
  })

  it('treats a glue cluster as one node and keeps its weld intact', () => {
    const O = 600_000
    const [root, memberA, memberB] = tree(O, [
      { x: 0, y: 0 },
      { x: 1200, y: 1500 },
      { x: 1360, y: 1500 },
    ]) as [string, string, string]
    useWidgetStore.getState().glueWidgets(memberB, memberA)
    link(root, memberA)
    const seamBefore = widgetAt(memberB).position.x - widgetAt(memberA).position.x

    useWidgetStore.getState().untangleWidgets([root, memberA, memberB])

    const a = widgetAt(memberA)
    const b = widgetAt(memberB)
    // The cluster translated as one rigid node: same seam, same baseline.
    expect(b.position.x - a.position.x).toBe(seamBefore)
    expect(b.position.y).toBe(a.position.y)
    // And it sits exactly 2 cells under its parent.
    expect(a.position.y - (widgetAt(root).position.y + 120)).toBe(GAP)

    useWidgetStore.getState().deleteWidgets([root, memberA, memberB])
  })

  it('falls back to plain separation when the selection holds no tree', () => {
    const O = 700_000
    const [a, b] = tree(O, [
      { x: 0, y: 0 },
      { x: 40, y: 40 },
    ]) as [string, string]

    useWidgetStore.getState().untangleWidgets([a, b])

    // No parent relation anywhere, so this is the old behaviour exactly: pushed
    // apart to the same 2-cell clearance, nothing else rearranged.
    const gapNow = Math.max(
      xGap(widgetAt(a), widgetAt(b)),
      Math.abs(widgetAt(a).position.y - widgetAt(b).position.y) - 120,
    )
    expect(gapNow).toBe(GAP)

    useWidgetStore.getState().deleteWidgets([a, b])
  })
})
