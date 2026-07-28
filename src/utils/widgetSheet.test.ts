import { describe, expect, it } from 'vitest'
import {
  SHEET_FALLBACK_RADIUS,
  SHEET_OPEN_CLIP,
  sheetDragDismisses,
  sheetDragScrim,
  sheetDragTravel,
  sheetFallbackOrigin,
  sheetOriginCenter,
  sheetOriginClip,
  widgetOpensAsSheet,
  type SheetOrigin,
} from './widgetSheet'

const VIEWPORT = { width: 390, height: 844 }

const origin = (patch: Partial<SheetOrigin> = {}): SheetOrigin => ({
  left: 100,
  top: 200,
  width: 120,
  height: 90,
  radius: 18,
  ...patch,
})

describe('widgetOpensAsSheet', () => {
  it('takes over the screen only on phone-width viewports', () => {
    expect(widgetOpensAsSheet('phone')).toBe(true)
    expect(widgetOpensAsSheet('tablet')).toBe(false)
    expect(widgetOpensAsSheet('desktop')).toBe(false)
  })
})

describe('sheetOriginClip', () => {
  it('frames exactly the tile inside the layer', () => {
    // 390 - (100 + 120) = 170 right, 844 - (200 + 90) = 554 bottom.
    expect(sheetOriginClip(origin(), VIEWPORT)).toBe('inset(200px 170px 554px 100px round 18px)')
  })

  it('opens to the whole layer with square corners', () => {
    expect(SHEET_OPEN_CLIP).toBe('inset(0px 0px 0px 0px round 0px)')
  })

  it('keeps a tile that hangs off the top-left inside the layer', () => {
    // Only the on-screen part of the tile frames the flight: x 0–60, y 0–50.
    const clip = sheetOriginClip(origin({ left: -60, top: -40 }), VIEWPORT)
    expect(clip).toBe('inset(0px 330px 794px 0px round 18px)')
  })

  it('never lets opposite insets cross when a tile hangs off the bottom-right', () => {
    // A tile entirely past the right edge would otherwise produce a negative
    // right inset — a clip reaching outside its own box.
    const clip = sheetOriginClip(origin({ left: 500, top: 900 }), VIEWPORT)
    expect(clip).toBe('inset(844px 0px 0px 390px round 18px)')
  })

  it('never emits a negative corner radius', () => {
    expect(sheetOriginClip(origin({ radius: -5 }), VIEWPORT)).toContain('round 0px')
  })
})

describe('sheetOriginCenter', () => {
  it('is the middle of the tapped tile, so the sheet grows out of it', () => {
    expect(sheetOriginCenter(origin())).toEqual({ x: 160, y: 245 })
  })

  it('follows a tile into a corner rather than drifting to the screen centre', () => {
    const corner = sheetOriginCenter(origin({ left: 0, top: 0, width: 80, height: 80 }))
    expect(corner).toEqual({ x: 40, y: 40 })
  })
})

describe('sheetFallbackOrigin', () => {
  it('centres a modest box when the tile cannot be measured', () => {
    const fallback = sheetFallbackOrigin(VIEWPORT)
    expect(fallback.left + fallback.width / 2).toBeCloseTo(VIEWPORT.width / 2)
    expect(fallback.top + fallback.height / 2).toBeCloseTo(VIEWPORT.height / 2)
    expect(fallback.width).toBeLessThan(VIEWPORT.width)
    expect(fallback.height).toBeLessThan(VIEWPORT.height)
    expect(fallback.radius).toBe(SHEET_FALLBACK_RADIUS)
  })

  it('stays inside a viewport smaller than its own caps', () => {
    const fallback = sheetFallbackOrigin({ width: 200, height: 300 })
    expect(fallback.left).toBeGreaterThanOrEqual(0)
    expect(fallback.top).toBeGreaterThanOrEqual(0)
    expect(fallback.left + fallback.width).toBeLessThanOrEqual(200)
    expect(fallback.top + fallback.height).toBeLessThanOrEqual(300)
  })
})

describe('pull-down to dismiss', () => {
  it('follows a downward finger exactly and absorbs upward pulls', () => {
    expect(sheetDragTravel(64)).toBe(64)
    expect(sheetDragTravel(0)).toBe(0)
    expect(sheetDragTravel(-120)).toBe(0)
  })

  it('needs a deliberate pull before letting go closes the sheet', () => {
    expect(sheetDragDismisses(20, VIEWPORT.height)).toBe(false)
    expect(sheetDragDismisses(140, VIEWPORT.height)).toBe(true)
  })

  it('caps the required pull on tall screens', () => {
    // 18% of 2000 would be 360px of haul; the ceiling keeps it at 140.
    expect(sheetDragDismisses(140, 2000)).toBe(true)
  })

  it('scales the threshold down on short screens', () => {
    // 18% of 400 is 72, so 140 is not the operative threshold here.
    expect(sheetDragDismisses(80, 400)).toBe(true)
    expect(sheetDragDismisses(60, 400)).toBe(false)
  })

  it('thins the scrim as the board is revealed, bounded to [0, 1]', () => {
    expect(sheetDragScrim(0, VIEWPORT.height)).toBe(1)
    expect(sheetDragScrim(VIEWPORT.height / 2, VIEWPORT.height)).toBeCloseTo(0.5)
    expect(sheetDragScrim(VIEWPORT.height * 2, VIEWPORT.height)).toBe(0)
    expect(sheetDragScrim(10, 0)).toBe(1)
  })
})
