import { describe, expect, it } from 'vitest'
import { ICON_MAX_EDGE, ICON_MIN_EDGE, ICONIFIED_SIZE, WIDGET_MAX_EDGE } from '../types/spatial'
import {
  clampIconEdge,
  crushesToIcon,
  elasticOvershoot,
  fullWidgetResizeBounds,
  ICON_CRUSH_PX,
  ICON_ESCAPE_PX,
  iconEscapesToFull,
  snapIconEdgeToGrid,
} from './widgetScale'

describe('widget scale gesture helpers', () => {
  it('uses stable icon geometry — a square across one grid cell', () => {
    expect(ICONIFIED_SIZE).toEqual({ width: 80, height: 80 })
    expect(ICON_MIN_EDGE).toBe(80)
    expect(ICON_MAX_EDGE).toBe(120)
    // One cell of adjustable range, and nothing smaller than 2x2.
    expect(ICON_MAX_EDGE - ICON_MIN_EDGE).toBe(40)
  })

  it('never lets a ceiling sit below a content-derived floor', () => {
    expect(fullWidgetResizeBounds(
      { minWidth: 700, minHeight: 500, maxWidth: 640, maxHeight: 480 },
      { minWidth: 200, minHeight: 120, maxWidth: 1280, maxHeight: 1280 },
    )).toEqual({ minWidth: 700, minHeight: 500, maxWidth: 700, maxHeight: 500 })
  })

  it('caps every bound at the absolute ceiling, whatever a type declares', () => {
    expect(fullWidgetResizeBounds(
      { minWidth: 9000, minHeight: 9000, maxWidth: 9000, maxHeight: 9000 },
      { minWidth: 200, minHeight: 120, maxWidth: 1280, maxHeight: 1280 },
    )).toEqual({
      minWidth: WIDGET_MAX_EDGE,
      minHeight: WIDGET_MAX_EDGE,
      maxWidth: WIDGET_MAX_EDGE,
      maxHeight: WIDGET_MAX_EDGE,
    })
  })

  it('crushes a resting tile to an icon only when both axes are pulled well in', () => {
    expect(crushesToIcon(ICON_CRUSH_PX, ICON_CRUSH_PX)).toBe(true)
    expect(crushesToIcon(ICON_CRUSH_PX, ICON_CRUSH_PX - 1)).toBe(false)
    expect(crushesToIcon(ICON_CRUSH_PX - 1, ICON_CRUSH_PX)).toBe(false)
    // Growth on either axis is never a crush.
    expect(crushesToIcon(400, -400)).toBe(false)
    expect(crushesToIcon(-400, 400)).toBe(false)
  })
})

describe('icon — a square scaled continuously across one cell', () => {
  it('preserves every in-range drag size without detents', () => {
    expect(clampIconEdge(80)).toBe(80)
    expect(clampIconEdge(97)).toBe(97)
    expect(clampIconEdge(101.25)).toBe(101.25)
    expect(clampIconEdge(120)).toBe(120)
  })

  it('clamps to the range at both ends', () => {
    expect(clampIconEdge(40)).toBe(80)
    expect(clampIconEdge(0)).toBe(80)
    expect(clampIconEdge(400)).toBe(120)
  })

  it('snaps only the committed edge to a 2×2 or 3×3 grid square', () => {
    expect(snapIconEdgeToGrid(80)).toBe(80)
    expect(snapIconEdgeToGrid(97.5)).toBe(80)
    expect(snapIconEdgeToGrid(99.99)).toBe(80)
    expect(snapIconEdgeToGrid(100)).toBe(120)
    expect(snapIconEdgeToGrid(101.25)).toBe(120)
    expect(snapIconEdgeToGrid(120)).toBe(120)
  })
})

describe('leaving the icon state', () => {
  const past = ICON_MAX_EDGE + ICON_ESCAPE_PX

  it('restores the full card only on growth past the 3x3 ceiling', () => {
    expect(iconEscapesToFull(past)).toBe(true)
    expect(iconEscapesToFull(past + 100)).toBe(true)
  })

  it('holds the icon anywhere inside (and just past) its range', () => {
    expect(iconEscapesToFull(80)).toBe(false)
    expect(iconEscapesToFull(120)).toBe(false)
    expect(iconEscapesToFull(past - 1)).toBe(false)
  })

  it('never escapes while shrinking — a crush is not a request for the card', () => {
    expect(iconEscapesToFull(40)).toBe(false)
    expect(iconEscapesToFull(0)).toBe(false)
  })
})

describe('rubber band', () => {
  it('never travels past its own limit, however hard it is pulled', () => {
    expect(elasticOvershoot(10_000)).toBeLessThanOrEqual(36)
    expect(elasticOvershoot(40)).toBeLessThan(36)
    expect(elasticOvershoot(0)).toBe(0)
    expect(elasticOvershoot(-50)).toBe(0)
    // Resistance grows: the first pixels of overpull move further than the last.
    expect(elasticOvershoot(20) - elasticOvershoot(10))
      .toBeGreaterThan(elasticOvershoot(120) - elasticOvershoot(110))
  })
})
