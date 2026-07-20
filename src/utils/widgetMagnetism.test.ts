import { describe, expect, it } from 'vitest'
import { magneticWidgetOffset } from './widgetMagnetism'

const rect = { left: 100, top: 200, width: 400, height: 200 }

describe('widget magnetism', () => {
  it('keeps the center anchored with only the resting lift', () => {
    expect(magneticWidgetOffset(rect, { x: 300, y: 300 })).toEqual({ x: 0, y: -1 })
  })

  it('leans toward the pointer without exceeding the visual budget', () => {
    expect(magneticWidgetOffset(rect, { x: 500, y: 400 })).toEqual({ x: 3, y: 1 })
    expect(magneticWidgetOffset(rect, { x: -10_000, y: -10_000 })).toEqual({ x: -3, y: -3 })
  })

  it('stays finite before layout has a measurable size', () => {
    expect(magneticWidgetOffset({ left: 0, top: 0, width: 0, height: 0 }, { x: 20, y: 20 }))
      .toEqual({ x: 0, y: -1 })
  })
})
