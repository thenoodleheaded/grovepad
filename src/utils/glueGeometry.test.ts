import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import {
  connectedGlueComponents,
  findGlueSnap,
  GLUE_GAP,
  GLUE_RANGE,
  glueSeamBetween,
  glueSeamsForCluster,
  glueSeparation,
  pulledFreeOfCluster,
  reconcileGlueClusters,
} from './glueGeometry'

function widget(id: string, x: number, y: number, width = 240, height = 160): Widget {
  return {
    id,
    type: 'notes',
    title: id,
    canvasId: 'canvas',
    position: { x, y },
    size: { width, height },
    data: { text: '' },
    // Pinned cards keep their stored box on the board — the geometry under
    // test is then exactly the rectangles this fixture writes, independent of
    // the content-derived resting tiles.
    metadata: { badges: [], pinned: true },
  }
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

describe('glue seams', () => {
  it('welds a side-by-side pair with a straight bar spanning the gap', () => {
    const seam = glueSeamBetween('a', rect(0, 0, 100, 100), 'b', rect(112, 20, 100, 100))!
    expect(seam.axis).toBe('x')
    expect(seam.aFirst).toBe(true)
    expect(seam.rect).toEqual({ x: 100, y: 20, width: 12, height: 80 })
  })

  it('welds a stacked pair with a horizontal bar', () => {
    const seam = glueSeamBetween('a', rect(0, 0, 100, 100), 'b', rect(-30, 112, 100, 100))!
    expect(seam.axis).toBe('y')
    expect(seam.rect).toEqual({ x: 0, y: 100, width: 70, height: 12 })
  })

  it('fills a diagonal elbow with a corner patch', () => {
    const seam = glueSeamBetween('a', rect(0, 0, 100, 100), 'b', rect(112, 112, 100, 100))!
    expect(seam.axis).toBe('corner')
    expect(seam.rect).toEqual({ x: 100, y: 100, width: 12, height: 12 })
  })

  it('refuses a weld once the gap opens past the seam ceiling', () => {
    expect(glueSeamBetween('a', rect(0, 0, 100, 100), 'b', rect(140, 0, 100, 100))).toBeNull()
  })

  it('refuses a bar weld without real perpendicular overlap', () => {
    expect(glueSeamBetween('a', rect(0, 0, 100, 100), 'b', rect(112, 90, 100, 100))?.axis).not.toBe('x')
  })

  it('traces an L-arrangement as two bars plus the corner elbow', () => {
    const widgets = {
      a: widget('a', 0, 0, 200, 160),
      b: widget('b', 212, 0, 200, 160),
      c: widget('c', 212, 172, 200, 160),
    }
    const seams = glueSeamsForCluster(['a', 'b', 'c'], widgets)
    const axes = seams.map((seam) => seam.axis).sort()
    expect(axes).toEqual(['corner', 'x', 'y'])
  })

  it('fills the heart of a 2×2 square arrangement', () => {
    const widgets = {
      a: widget('a', 0, 0, 200, 160),
      b: widget('b', 212, 0, 200, 160),
      c: widget('c', 0, 172, 200, 160),
      d: widget('d', 212, 172, 200, 160),
    }
    const seams = glueSeamsForCluster(['a', 'b', 'c', 'd'], widgets)
    expect(seams.filter((seam) => seam.axis === 'x')).toHaveLength(2)
    expect(seams.filter((seam) => seam.axis === 'y')).toHaveLength(2)
    expect(seams.filter((seam) => seam.axis === 'corner')).toHaveLength(2)
  })
})

describe('option-drag glue snapping', () => {
  it('snaps the dragged widget to an exact 0.3-cell seam beside the target', () => {
    const dragged = widget('dragged', 340, 10)
    const target = widget('target', 60, 0)
    const snap = findGlueSnap(dragged, { dragged, target })!
    expect(snap.targetId).toBe('target')
    expect(snap.axis).toBe('x')
    // target right edge (60 + 240) + GLUE_GAP.
    expect(snap.position).toEqual({ x: 300 + GLUE_GAP, y: 10 })
  })

  it('snaps from the left and above symmetrically', () => {
    const target = widget('target', 300, 300)
    const fromLeft = widget('left', 300 - 240 - 30, 320)
    expect(findGlueSnap(fromLeft, { left: fromLeft, target })!.position.x)
      .toBe(300 - GLUE_GAP - 240)
    const fromAbove = widget('above', 320, 300 - 160 - 30)
    expect(findGlueSnap(fromAbove, { above: fromAbove, target })!.position.y)
      .toBe(300 - GLUE_GAP - 160)
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
    expect(snap.position).toEqual({ x: 240 + GLUE_GAP, y: 10 })
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
