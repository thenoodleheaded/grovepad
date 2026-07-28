import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import { makeWidget } from '../test/factories'
import { WIDGET_TITLE_ROW } from './widgetRest'
import {
  COLLAPSED_MEMBER_SIZE,
  closeClusterGaps,
  collapsedClusterLayout,
  compactWeldedCluster,
  connectedGlueComponents,
  findGlueSnap,
  clusterFrameEnvelope,
  clusterTitleRowRect,
  GLUE_FRAME_BAND,
  GLUE_GAP,
  GLUE_RANGE,
  GLUE_TITLE_HEADROOM,
  GLUE_TITLE_ROW_H,
  glueChromeRect,
  glueSeparation,
  insetGlueRects,
  pulledFreeOfCluster,
  reconcileGlueClusters,
  reflowWeldedCluster,
  refoldCollapsedCluster,
  unfoldReleasedFoldedMembers,
} from './glueGeometry'

function widget(id: string, x: number, y: number, width = 240, height = 160): Widget {
  // Pinned cards keep their stored box on the board — the geometry under
  // test is then exactly the rectangles this fixture writes, independent of
  // the content-derived resting tiles.
  return makeWidget({
    id,
    position: { x, y },
    size: { width, height },
    metadata: { badges: [], pinned: true },
  })
}

function rect(x: number, y: number, width: number, height: number) {
  return { x, y, width, height }
}

describe('glue separation', () => {
  it('is zero for touching or overlapping boxes and edge-to-edge otherwise', () => {
    expect(glueSeparation(rect(0, 0, 100, 100), rect(100, 0, 100, 100))).toBe(0)
    expect(glueSeparation(rect(0, 0, 100, 100), rect(50, 50, 100, 100))).toBe(0)
    expect(glueSeparation(rect(0, 0, 100, 100), rect(112, 0, 100, 100))).toBe(12)
    expect(glueSeparation(rect(0, 0, 100, 100), rect(0, 130, 100, 100))).toBe(30)
  })
})

describe('carved glue seam geometry', () => {
  it('insets touching members so the carved gap is exactly GLUE_GAP', () => {
    // Two grid-aligned cards stored edge to edge (gap 0). The gap is carved
    // half from each, and the outer corners never move off the grid. Nothing
    // is painted into that gap any more — the cards' own local aura pools
    // behind them is what reads as the join.
    const widgets = { a: widget('a', 0, 0, 200, 160), b: widget('b', 200, 0, 200, 160) }
    const rects = insetGlueRects(['a', 'b'], widgets)
    const ra = rects.get('a')!
    const rb = rects.get('b')!
    expect(rb.x - (ra.x + ra.width)).toBe(GLUE_GAP)
    expect(ra.x).toBe(0)
    expect(rb.x + rb.width).toBe(400)
  })
})

describe('option-drag glue snapping', () => {
  it('snaps the dragged widget to an exact 0.3-cell seam beside the target', () => {
    const dragged = widget('dragged', 340, 10)
    const target = widget('target', 60, 0)
    const snap = findGlueSnap(dragged, { dragged, target })!
    expect(snap.targetId).toBe('target')
    expect(snap.axis).toBe('x')
    // Bond axis: the dragged edge TOUCHES the target's right edge (60 + 240);
    // the visible seam is the render inset. Perpendicular: y=10 grid-snaps.
    expect(snap.position).toEqual({ x: 300, y: 0 })
  })

  it('snaps from the left and above symmetrically', () => {
    const target = widget('target', 300, 300)
    const fromLeft = widget('left', 300 - 240 - 30, 320)
    expect(findGlueSnap(fromLeft, { left: fromLeft, target })!.position.x)
      .toBe(300 - 240)
    const fromAbove = widget('above', 320, 300 - 160 - 30)
    expect(findGlueSnap(fromAbove, { above: fromAbove, target })!.position.y)
      .toBe(300 - 160)
  })

  it('finds nothing beyond glue range or without facing overlap', () => {
    const dragged = widget('dragged', 240 + GLUE_RANGE + 41, 0)
    const target = widget('target', 0, 0)
    expect(findGlueSnap(dragged, { dragged, target })).toBeNull()
    const skewed = widget('skewed', 252, 155)
    expect(findGlueSnap(skewed, { skewed, target })).toBeNull()
  })

  it('forgives a small overshoot into the target, snapping back onto the seam', () => {
    const target = widget('target', 0, 0)
    // Dragged 15px past the target's right edge (overlapping) still welds.
    const overshot = widget('overshot', 225, 10)
    const snap = findGlueSnap(overshot, { overshot, target })!
    expect(snap.targetId).toBe('target')
    expect(snap.axis).toBe('x')
    expect(snap.position).toEqual({ x: 240, y: 0 })
  })

  it('refuses to glue a card dropped squarely on top of another', () => {
    const target = widget('target', 0, 0)
    const onTop = widget('onTop', 5, 5)
    expect(findGlueSnap(onTop, { onTop, target })).toBeNull()
  })

  it('never targets widgets on another canvas or excluded ids', () => {
    const dragged = widget('dragged', 252, 0)
    const other = { ...widget('other', 0, 0), canvasId: 'elsewhere' }
    expect(findGlueSnap(dragged, { dragged, other })).toBeNull()
    const near = widget('near', 0, 0)
    expect(findGlueSnap(dragged, { dragged, near }, { excludeIds: new Set(['near']) })).toBeNull()
  })
})

describe('pulling free', () => {
  it('reads an option-drag as unglue only past GLUE_RANGE from every member', () => {
    const a = widget('a', 0, 0)
    const near = widget('near', 240 + GLUE_RANGE - 1, 0)
    const far = widget('far', 240 + GLUE_RANGE + 1, 0)
    expect(pulledFreeOfCluster(near, ['a', 'near'], { a, near })).toBe(false)
    expect(pulledFreeOfCluster(far, ['a', 'far'], { a, far })).toBe(true)
  })
})

describe('cluster connectedness', () => {
  // A welded row, then a far-off straggler, all in the same fixture map.
  const a = widget('a', 0, 0)
  const b = widget('b', 252, 0) // 240 wide + 12 gap: touches a
  const c = widget('c', 504, 0) // touches b
  const far = widget('far', 5_000, 0)

  it('groups members by what still touches, isolating a drifted card', () => {
    const components = connectedGlueComponents(['a', 'b', 'far'], { a, b, c, far })
    expect(components).toEqual([['a', 'b'], ['far']])
  })

  it('keeps a fully welded run as one component', () => {
    expect(connectedGlueComponents(['a', 'b', 'c'], { a, b, c, far })).toEqual([['a', 'b', 'c']])
  })

  it('reconciles a record whose piece drifted off, dropping the lone straggler', () => {
    const glues = { g1: { id: 'g1', widgetIds: ['a', 'b', 'far'] } }
    const out = reconcileGlueClusters({ a, b, c, far }, glues, () => 'fresh')
    expect(out.g1!.widgetIds).toEqual(['a', 'b'])
    expect(Object.keys(out)).toEqual(['g1'])
  })

  it('splits one record into two surviving clusters, minting an id for the second', () => {
    const d = widget('d', 5_252, 0) // touches far
    const glues = { g1: { id: 'g1', widgetIds: ['a', 'b', 'far', 'd'] } }
    const out = reconcileGlueClusters({ a, b, far, d }, glues, () => 'fresh')
    expect(out.g1!.widgetIds).toEqual(['a', 'b'])
    expect(out.fresh!.widgetIds).toEqual(['far', 'd'])
  })

  it('returns the same reference when every cluster is still whole', () => {
    const glues = { g1: { id: 'g1', widgetIds: ['a', 'b', 'c'] } }
    expect(reconcileGlueClusters({ a, b, c }, glues)).toBe(glues)
  })
})

describe('cluster reflow when a member changes footprint', () => {
  const box = (id: string, x: number, y: number, width: number, height: number) =>
    ({ id, rect: rect(x, y, width, height) })

  it('pushes clustermates exactly far enough to touch the grown card again', () => {
    // A row of three 200-wide cards. The first is pinned open and now measures
    // 320 — 120px into its neighbour, which is 120px into the third.
    const moved = reflowWeldedCluster(
      [box('a', 0, 0, 320, 160), box('b', 200, 0, 200, 160), box('c', 400, 0, 200, 160)],
      ['a'],
    )
    // The anchor holds; the rest of the row shifts by the whole growth...
    expect(moved.has('a')).toBe(false)
    expect(moved.get('b')).toEqual({ x: 320, y: 0 })
    expect(moved.get('c')).toEqual({ x: 520, y: 0 })
    // ...and every seam is still a seam: the cards touch, so the render insets
    // carve the same GLUE_GAP they always did. Nothing is a cell apart.
    expect(moved.get('b')!.x).toBe(320)
    expect(moved.get('c')!.x - (moved.get('b')!.x + 200)).toBe(0)
  })

  it('pushes along the axis the pair is arranged on, keeping the arrangement', () => {
    // Welded below: the card that grew is taller now, so its neighbour slides
    // further down — it must not be lifted sideways out of the column.
    const below = reflowWeldedCluster(
      [box('a', 0, 0, 200, 260), box('b', 0, 160, 200, 160)],
      ['a'],
    )
    expect(below.get('b')).toEqual({ x: 0, y: 260 })

    // Welded beside: a card 320 tall growing to 400 wide would escape "cheaper"
    // upward, which would tear the row apart. It goes sideways instead.
    const beside = reflowWeldedCluster(
      [box('a', 0, 0, 400, 320), box('b', 200, 0, 200, 320)],
      ['a'],
    )
    expect(beside.get('b')).toEqual({ x: 400, y: 0 })
  })

  it('never moves an anchored member, and leaves a clean cluster untouched', () => {
    expect(reflowWeldedCluster([box('a', 0, 0, 200, 160), box('b', 200, 0, 200, 160)], ['a']).size)
      .toBe(0)
    // Both anchored: the caller asked for both to hold, so neither is shoved.
    const held = reflowWeldedCluster(
      [box('a', 0, 0, 320, 160), box('b', 200, 0, 200, 160)],
      ['a', 'b'],
    )
    expect(held.size).toBe(0)
  })

  it('falls back to the leading member when nothing is anchored', () => {
    const moved = reflowWeldedCluster([box('a', 0, 0, 320, 160), box('b', 200, 0, 200, 160)], [])
    expect(moved.has('a')).toBe(false)
    expect(moved.get('b')).toEqual({ x: 320, y: 0 })
  })

  it('sends a SWALLOWED neighbour along the row, never up out of it', () => {
    // A row of five icons; the middle is pinned open and now measures 240×200
    // of chrome, which swallows the icon to its right whole. That icon's
    // centre then sits almost exactly on the grown card's, so every centre
    // comparison ties — and the cheapest escape used to lift it OUT of the
    // row, where no amount of closing ranks could ever bring it back.
    const moved = reflowWeldedCluster(
      [
        box('a', 0, 40, 80, 80), box('b', 80, 40, 80, 80),
        box('c', 160, 0, 240, 200),
        box('d', 240, 40, 80, 80), box('e', 320, 40, 80, 80),
      ],
      ['c'],
    )
    // Everyone stays on the row: only x changes, and the swallowed card comes
    // out of the side it was welded on.
    expect(moved.get('d')).toEqual({ x: 400, y: 40 })
    expect(moved.get('e')).toEqual({ x: 480, y: 40 })
    expect(moved.has('a')).toBe(false)
    expect(moved.has('b')).toBe(false)
  })
})

describe('cluster compaction when a member shrinks or leaves', () => {
  const box = (id: string, x: number, y: number, width = 80, height = 80) =>
    ({ id, rect: rect(x, y, width, height) })

  it('closes the hole a shrunk member leaves in a row', () => {
    // A row of four. The second was pinned open at 240 and has just been
    // unpinned back to an 80 icon, holding its welded top-left corner. The
    // rest of the row still stands where the open card used to end.
    const moved = compactWeldedCluster(
      [box('a', 0, 0), box('b', 80, 0), box('c', 400, 0), box('d', 480, 0)],
      ['b'],
    )
    expect(moved.has('a')).toBe(false)
    expect(moved.has('b')).toBe(false)
    // Both close onto the shrunk card, and onto each other: no gaps left.
    expect(moved.get('c')).toEqual({ x: 160, y: 0 })
    expect(moved.get('d')).toEqual({ x: 240, y: 0 })
  })

  it('closes an interior hole even though the block never came apart', () => {
    // Eight icons round a hole where the middle one was dragged out. Every
    // survivor still touches its neighbours AROUND the gap, so connectivity
    // sees one whole cluster — this is the case a component-level repair is
    // blind to, and the one the bug report showed.
    const moved = compactWeldedCluster(
      [
        box('a', 0, 0), box('b', 80, 0), box('c', 160, 0),
        box('d', 0, 80), /* hole at 80,80 */ box('f', 160, 80),
        box('g', 0, 160), box('h', 80, 160), box('i', 160, 160),
      ],
      ['a'],
    )
    // The block re-packs onto itself: eight cards cannot fill a 3×3, so the
    // one missing square ends up at the OUTER edge, never in the middle.
    expect(moved.get('f')).toEqual({ x: 80, y: 80 })
    expect(moved.get('i')).toEqual({ x: 160, y: 80 })
    expect(moved.has('a')).toBe(false)
    expect(moved.has('c')).toBe(false)
    expect(moved.has('h')).toBe(false)
  })

  it('travels along the axis a member is arranged on, keeping rows rows', () => {
    // A column with a hole: the card below must come straight up, not sidle
    // across into the anchor's own lane.
    const column = compactWeldedCluster([box('a', 0, 0), box('b', 0, 240)], ['a'])
    expect(column.get('b')).toEqual({ x: 0, y: 80 })

    // Staircase: the two touch at a corner only and share no lane, so there is
    // nothing to close onto and the arrangement survives untouched.
    const stair = compactWeldedCluster([box('a', 0, 0), box('b', 80, 80)], ['a'])
    expect(stair.size).toBe(0)
  })

  it('never moves an anchor, never overlaps, and settles in one pass', () => {
    const boxes = [box('a', 0, 0), box('b', 80, 0), box('c', 400, 0), box('d', 480, 0)]
    const once = compactWeldedCluster(boxes, ['b'])
    // Nothing is pulled on top of anything: every pair still has clear air or
    // an exact shared edge.
    const settled = boxes.map((entry) => {
      const corner = once.get(entry.id) ?? entry.rect
      return rect(corner.x, corner.y, entry.rect.width, entry.rect.height)
    })
    for (let i = 0; i < settled.length; i += 1) {
      for (let j = i + 1; j < settled.length; j += 1) {
        expect(glueSeparation(settled[i]!, settled[j]!)).toBeGreaterThanOrEqual(0)
        const overlapX =
          Math.min(settled[i]!.x + settled[i]!.width, settled[j]!.x + settled[j]!.width) -
          Math.max(settled[i]!.x, settled[j]!.x)
        const overlapY =
          Math.min(settled[i]!.y + settled[i]!.height, settled[j]!.y + settled[j]!.height) -
          Math.max(settled[i]!.y, settled[j]!.y)
        expect(overlapX > 0.5 && overlapY > 0.5).toBe(false)
      }
    }
    // Idempotent: a compact cluster is already home, so a second run is a
    // no-op — running the pass on every footprint change cannot drift a group.
    expect(compactWeldedCluster(
      settled.map((r, index) => ({ id: boxes[index]!.id, rect: r })),
      ['b'],
    ).size).toBe(0)
  })

  it('is the exact inverse of the push half: grow then shrink returns the layout', () => {
    // The reversibility the group already promises for opening and closing a
    // card: the two passes must undo each other, or every open/close walks the
    // cluster a little further.
    const start = [box('a', 0, 0, 200, 160), box('b', 200, 0, 200, 160), box('c', 400, 0, 200, 160)]
    const grown = reflowWeldedCluster(
      [box('a', 0, 0, 320, 160), box('b', 200, 0, 200, 160), box('c', 400, 0, 200, 160)],
      ['a'],
    )
    expect(grown.get('b')).toEqual({ x: 320, y: 0 })
    expect(grown.get('c')).toEqual({ x: 520, y: 0 })
    // Now the card shrinks back to 200 and the row closes up again.
    const shrunk = compactWeldedCluster(
      [box('a', 0, 0, 200, 160), box('b', 320, 0, 200, 160), box('c', 520, 0, 200, 160)],
      ['a'],
    )
    expect(shrunk.get('b')).toEqual({ x: start[1]!.rect.x, y: 0 })
    expect(shrunk.get('c')).toEqual({ x: start[2]!.rect.x, y: 0 })
  })

  it('returns a row of icons exactly where it started after pin then unpin', () => {
    // The whole promise, end to end, in the shape the bug was reported in: the
    // middle icon of a welded row is pinned open (the push half makes room)
    // and then unpinned (this half closes it back up). The row must come out
    // identical to how it went in — anything else walks the group a little
    // further on every open and close.
    const start = [
      box('a', 0, 40), box('b', 80, 40), box('c', 160, 40),
      box('d', 240, 40), box('e', 320, 40),
    ]
    const opened = reflowWeldedCluster(
      [
        start[0]!, start[1]!,
        box('c', 160, 0, 240, 200),
        start[3]!, start[4]!,
      ],
      ['c'],
    )
    // Then the card is unpinned: back to an 80 icon, still welded at its own
    // corner, with its neighbours parked where the growth left them.
    const closed = compactWeldedCluster(
      [
        start[0]!, start[1]!, box('c', 160, 40),
        box('d', opened.get('d')!.x, opened.get('d')!.y),
        box('e', opened.get('e')!.x, opened.get('e')!.y),
      ],
      ['c'],
    )
    expect(closed.get('d')).toEqual({ x: start[3]!.rect.x, y: start[3]!.rect.y })
    expect(closed.get('e')).toEqual({ x: start[4]!.rect.x, y: start[4]!.rect.y })
  })

  it('closes ranks through closeClusterGaps for a hole no split can reveal', () => {
    // Same interior hole, this time through the store-facing entry point, so
    // the wiring every call site uses is covered too. These members are pinned,
    // so each also reserves its floating title row — which is why the second
    // row is stored a row-height clear of the first (80 box + WIDGET_TITLE_ROW)
    // rather than flush against it.
    const row = 80 + WIDGET_TITLE_ROW
    const members = {
      a: widget('a', 0, 0, 80, 80),
      b: widget('b', 80, 0, 80, 80),
      c: widget('c', 160, 0, 80, 80),
      d: widget('d', 0, row, 80, 80),
      f: widget('f', 160, row, 80, 80),
    }
    const ids = ['a', 'b', 'c', 'd', 'f']
    expect(connectedGlueComponents(ids, members).length).toBe(1)
    const closed = closeClusterGaps(members, ids, ['a'])
    // f slides into the hole beside d — and stops there, rather than riding up
    // under the name row of the card above.
    expect(closed.f!.position).toEqual({ x: 80, y: row })
    expect(closed.a!.position).toEqual({ x: 0, y: 0 })
  })
})

describe('folded cluster packing', () => {
  it('folds every member to a single cell', () => {
    expect(COLLAPSED_MEMBER_SIZE).toEqual({ width: 40, height: 40 })
  })

  it('stacks icons into the closest square, exactly like a ghost node', () => {
    // Four members: a 2×2 block, cells touching, grid-aligned.
    const four = collapsedClusterLayout(4)
    expect(four.offsets).toEqual([
      { x: 0, y: 0 }, { x: 40, y: 0 },
      { x: 0, y: 40 }, { x: 40, y: 40 },
    ])
    expect(four).toMatchObject({ width: 80, height: 80 })
  })

  it('centres a short row on whole cells, so the block stays grid-aligned', () => {
    // Three members pack as 2 over 1 (balanced rows); the lone one centres.
    const three = collapsedClusterLayout(3)
    expect(three.offsets).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 40 }])
    for (const offset of collapsedClusterLayout(7).offsets) {
      expect(offset.x % 40).toBe(0)
      expect(offset.y % 40).toBe(0)
    }
  })

  it('lays a pair out side by side and handles the empty case', () => {
    expect(collapsedClusterLayout(2).offsets).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }])
    expect(collapsedClusterLayout(0)).toEqual({ width: 0, height: 0, offsets: [] })
  })
})

describe('folding and re-folding a collapsed cluster', () => {
  it('folds every member to one cell and records its pre-fold state', () => {
    const widgets = { a: widget('a', 0, 0, 240, 160), b: widget('b', 260, 0, 200, 120) }
    const { widgets: folded, restore } = refoldCollapsedCluster(widgets, ['a', 'b'], undefined)
    expect(folded.a!.size).toEqual({ width: 40, height: 40 })
    expect(folded.b!.size).toEqual({ width: 40, height: 40 })
    expect(folded.a!.iconified).toBe(true)
    // Pre-fold state remembered, so an unfold can put each card back exactly.
    expect(restore.a).toEqual({ x: 0, y: 0, width: 240, height: 160, iconified: false })
    expect(restore.b).toMatchObject({ width: 200, height: 120 })
    // The parked full size lets a member expand on its own once released.
    expect(folded.a!.expandedSize).toEqual({ width: 240, height: 160 })
    // Packed touching and grid-aligned.
    expect(folded.b!.position.x - folded.a!.position.x).toBe(40)
  })

  it('stacks a newcomer in while keeping the standing block anchored', () => {
    // a,b already folded near (400,400); c is a full card far away.
    const widgets = {
      a: { ...widget('a', 400, 400, 40, 40), iconified: true, expandedSize: { width: 240, height: 160 } },
      b: { ...widget('b', 440, 400, 40, 40), iconified: true, expandedSize: { width: 200, height: 120 } },
      c: widget('c', 9000, 9000, 320, 200),
    }
    const existingRestore = {
      a: { x: 100, y: 100, width: 240, height: 160, iconified: false },
      b: { x: 340, y: 100, width: 200, height: 120, iconified: false },
    }
    const { widgets: folded, restore } = refoldCollapsedCluster(widgets, ['a', 'b', 'c'], existingRestore)
    // The block stays put at the existing members' corner, not c's far one.
    const minX = Math.min(folded.a!.position.x, folded.b!.position.x, folded.c!.position.x)
    const minY = Math.min(folded.a!.position.y, folded.b!.position.y, folded.c!.position.y)
    expect(minX).toBe(400)
    expect(minY).toBe(400)
    // The newcomer folds and records its OWN pre-fold state; a,b keep theirs.
    expect(folded.c!.size).toEqual({ width: 40, height: 40 })
    expect(restore.c).toEqual({ x: 9000, y: 9000, width: 320, height: 200, iconified: false })
    expect(restore.a).toEqual(existingRestore.a)
  })
})

describe('restoring members released from a collapsed group', () => {
  const folded = (id: string, x: number, y: number) => ({
    ...widget(id, x, y, 40, 40),
    iconified: true,
    expandedSize: { width: 240, height: 160 },
  })

  it('unfolds a 1×1 member no longer in any collapsed cluster, using the saved entry', () => {
    const widgets = { a: folded('a', 0, 0), b: folded('b', 40, 0) }
    const prev = {
      g: {
        id: 'g', widgetIds: ['a', 'b'], collapsed: true, restore: {
          a: { x: 5, y: 6, width: 240, height: 160, iconified: false },
          b: { x: 250, y: 6, width: 200, height: 120, iconified: false },
        },
      },
    }
    const out = unfoldReleasedFoldedMembers(widgets, prev, {})
    expect(out.a!.size).toEqual({ width: 240, height: 160 })
    expect(out.a!.position).toEqual({ x: 5, y: 6 })
    expect(out.a!.iconified).toBe(false)
    expect(out.b!.position).toEqual({ x: 250, y: 6 })
  })

  it('leaves members still inside a collapsed cluster folded', () => {
    const widgets = { a: folded('a', 0, 0), b: folded('b', 40, 0) }
    const glues = { g: { id: 'g', widgetIds: ['a', 'b'], collapsed: true, restore: {} } }
    expect(unfoldReleasedFoldedMembers(widgets, glues, glues)).toBe(widgets)
  })

  it('falls back to the dormant full size when no memory survives', () => {
    const widgets = { a: folded('a', 0, 0) }
    const out = unfoldReleasedFoldedMembers(widgets, {}, {})
    expect(out.a!.size).toEqual({ width: 240, height: 160 })
    expect(out.a!.iconified).toBe(false)
  })
})

describe('the group boundary is a frame plus its own title row', () => {
  // A wide cluster with a short name: most of the band above it is empty
  // canvas, and that emptiness must stay board, not group.
  const wide = { a: widget('a', 0, 0, 600, 160), b: widget('b', 0, 160, 600, 160) }
  const ids = ['a', 'b']

  it('stands the frame a band clear of everything the members occupy', () => {
    const env = clusterFrameEnvelope(ids, wide)!
    expect(env.x).toBe(-GLUE_FRAME_BAND)
    expect(env.width).toBe(600 + GLUE_FRAME_BAND * 2)
    // These members are pinned, so each floats its own title row — real
    // occupied space the frame has to stand clear of, above the top card.
    expect(env.y).toBe(-GLUE_FRAME_BAND - WIDGET_TITLE_ROW)
    expect(env.height).toBe(320 + WIDGET_TITLE_ROW + GLUE_FRAME_BAND * 2)
    // The frame itself claims no title-row headroom of its OWN: the group's
    // name row is a separate, bounded rect, not a full-width band.
    expect(env.y).toBeGreaterThan(-GLUE_TITLE_HEADROOM - WIDGET_TITLE_ROW)
  })

  it('bounds the title row to the icon, name, and buttons — never the full width', () => {
    const row = clusterTitleRowRect(ids, wide, undefined)!
    expect(row.x).toBe(0)
    expect(row.y).toBe(-GLUE_TITLE_HEADROOM)
    expect(row.height).toBe(GLUE_TITLE_ROW_H)
    // The empty canvas beside a short name is not the group.
    expect(row.width).toBeLessThan(300)
    // A long name claims more of the band, but the row still tracks the label.
    const named = clusterTitleRowRect(ids, wide, 'Quarterly planning workstream')!
    expect(named.width).toBeGreaterThan(row.width)
  })

  it('reserves a member’s own title row only when that member shows one', () => {
    // A pinned member floats its own row (its only Pin control), so the card
    // above it must not be packed into that strip.
    const pinned = widget('p', 0, 0, 240, 160)
    expect(glueChromeRect(pinned).y).toBe(-WIDGET_TITLE_ROW)
    expect(glueChromeRect(pinned).height).toBe(160 + WIDGET_TITLE_ROW)
    // An unpinned member hands its name to the group frame: no strip at all.
    const plain = { ...pinned, metadata: { badges: [] } }
    expect(glueChromeRect(plain).y).toBe(0)
    // An icon IS its own identity mark and floats nothing.
    const icon = { ...pinned, iconified: true, size: { width: 80, height: 80 } }
    expect(glueChromeRect(icon).y).toBe(0)
  })
})
