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
    expect(SNAP_OVERSHOOT_PX).toBe(36)
  })

  it('never lets a ceiling sit below a content-derived floor', () => {
    expect(fullWidgetResizeBounds(
      { minWidth: 700, minHeight: 500, maxWidth: 640, maxHeight: 480 },
      { minWidth: 200, minHeight: 120, maxWidth: 1280, maxHeight: 1280 },
    )).toEqual({ minWidth: 700, minHeight: 500, maxWidth: 700, maxHeight: 500 })
  })

  it('requires both axes to cross the state-change threshold', () => {
    expect(crossedBothScaleAxes(36, 36)).toBe(true)
    expect(crossedBothScaleAxes(36, 35)).toBe(false)
    expect(crossedBothScaleAxes(35, 36)).toBe(false)
    expect(crossedBothScaleAxes(400, -400)).toBe(false)
    expect(crossedBothScaleAxes(-400, 400)).toBe(false)
  })
})
