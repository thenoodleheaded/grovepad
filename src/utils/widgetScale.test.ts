import { describe, expect, it } from 'vitest'
import { ICONIFIED_SIZE } from '../types/spatial'
import {
  crossedBothScaleAxes,
  fullWidgetResizeBounds,
  SNAP_OVERSHOOT_PX,
} from './widgetScale'

describe('widget scale gesture helpers', () => {
  it('uses stable pill/icon transition geometry', () => {
    expect(ICONIFIED_SIZE).toEqual({ width: 80, height: 80 })
    // Deliberate-intent threshold: overshooting a minimum while resizing
    // small must not collapse the card (36 was routinely crossed by accident).
    expect(SNAP_OVERSHOOT_PX).toBe(90)
  })

  it('never lets a ceiling sit below a content-derived floor', () => {
    expect(fullWidgetResizeBounds(
      { minWidth: 700, minHeight: 500, maxWidth: 640, maxHeight: 480 },
      { minWidth: 200, minHeight: 120, maxWidth: 1280, maxHeight: 1280 },
    )).toEqual({ minWidth: 700, minHeight: 500, maxWidth: 700, maxHeight: 500 })
  })

  it('requires both axes to cross the state-change threshold', () => {
    expect(crossedBothScaleAxes(SNAP_OVERSHOOT_PX, SNAP_OVERSHOOT_PX)).toBe(true)
    expect(crossedBothScaleAxes(SNAP_OVERSHOOT_PX, SNAP_OVERSHOOT_PX - 1)).toBe(false)
    expect(crossedBothScaleAxes(SNAP_OVERSHOOT_PX - 1, SNAP_OVERSHOOT_PX)).toBe(false)
    expect(crossedBothScaleAxes(400, -400)).toBe(false)
    expect(crossedBothScaleAxes(-400, 400)).toBe(false)
  })
})
