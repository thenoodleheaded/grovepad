import { describe, expect, it } from 'vitest'
import { ICONIFIED_SIZE } from '../types/spatial'
import { fullWidgetResizeBounds, pillSizeForTitle, SNAP_OVERSHOOT_PX } from './widgetScale'

describe('widget scale states', () => {
  it('keeps icon mode at two grid cells square', () => {
    expect(ICONIFIED_SIZE).toEqual({ width: 80, height: 80 })
  })

  it('uses the lower scale-transition threshold', () => {
    expect(SNAP_OVERSHOOT_PX).toBe(36)
  })

  it('uses the type ceiling rather than the size where a growth drag starts', () => {
    expect(
      fullWidgetResizeBounds(
        { minWidth: 200, minHeight: 160, maxWidth: 640, maxHeight: 480 },
        { minWidth: 200, minHeight: 120, maxWidth: 1280, maxHeight: 1280 },
      ),
    ).toEqual({ minWidth: 200, minHeight: 160, maxWidth: 640, maxHeight: 480 })
  })

  it('keeps collapsed pills at least two cells wide', () => {
    expect(pillSizeForTitle('A')).toMatchObject({ height: 40 })
    expect(pillSizeForTitle('A').width).toBeGreaterThanOrEqual(80)
  })
})
