import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SHEET_FALLBACK_RADIUS,
  SHEET_OPEN_RADIUS,
  sheetDragDismisses,
  sheetDragScrim,
  sheetDragTravel,
  sheetFallbackOrigin,
  sheetOpenClip,
  sheetOpenMargin,
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

  it('opens to an inset, rounded panel rather than full bleed', () => {
    // 390 * 0.042 = 16.4 -> 16. The band of board this leaves is the only
    // place the blur behind the sheet is ever visible.
    expect(sheetOpenClip(VIEWPORT)).toBe('inset(16px 16px 16px 16px round 30px)')
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

describe('sheetOpenMargin', () => {
  it('scales with the shorter side, so a wide screen does not over-inset', () => {
    // Driven by 800, not 1440: a margin taken from the width would be more than
    // three times as deep on this screen as the height can spare.
    expect(sheetOpenMargin({ width: 1440, height: 800 })).toBe(34)
  })

  it('never thins below a readable frame on a small viewport', () => {
    // 320 * 0.042 = 13.4, which would read as a rendering seam, not a frame.
    expect(sheetOpenMargin({ width: 320, height: 480 })).toBe(16)
  })

  it('stops widening on a very large screen', () => {
    // Uncapped this would be 90px, at which point the sheet stops reading as
    // the widget owning the screen and starts reading as an ordinary dialog.
    expect(sheetOpenMargin({ width: 3840, height: 2160 })).toBe(56)
  })

  it('leaves the panel at least as wide as the board it frames', () => {
    for (const viewport of [
      { width: 320, height: 480 },
      { width: 390, height: 844 },
      { width: 1440, height: 800 },
      { width: 3840, height: 2160 },
    ]) {
      const margin = sheetOpenMargin(viewport)
      expect(viewport.width - margin * 2).toBeGreaterThan(0)
      expect(viewport.height - margin * 2).toBeGreaterThan(0)
    }
  })
})

describe('sheetOpenClip corner radius', () => {
  it('wears the full corner when there is room for it', () => {
    expect(sheetOpenClip({ width: 1440, height: 800 })).toContain(`round ${SHEET_OPEN_RADIUS}px`)
  })

  it('never rounds a tiny viewport into a lozenge', () => {
    // 60 - 32 = 28 of panel across; half of that is 14, well under the 30 the
    // panel would otherwise ask for. A radius past half the box makes the
    // opposite corners meet.
    const clip = sheetOpenClip({ width: 60, height: 60 })
    expect(clip).toBe('inset(16px 16px 16px 16px round 14px)')
  })
})

const sheetCss = readFileSync(
  new URL('../styles/product/33-widget-sheet.css', import.meta.url),
  'utf8',
)
/** The same file with comments stripped. Assertions about what the stylesheet
 *  DOESN'T do have to read declarations only — this file explains at length
 *  why it avoids `backdrop-filter`, and the prose alone would fail the check. */
const sheetRules = sheetCss.replace(/\/\*[\s\S]*?\*\//g, '')

describe('the board behind an open sheet', () => {
  it('blurs the board itself, never a full-screen backdrop-filter over it', () => {
    // Commit 826302a deliberately took the viewport-sized `backdrop-filter` off
    // the settings overlay and put the blur on the panel instead. Re-adding one
    // here would reintroduce exactly that cost, one screen over.
    expect(sheetRules).toContain('filter: blur(calc(18px * var(--gp-blur-scale, 1)))')
    expect(sheetRules).not.toContain('backdrop-filter')
  })

  it('holds the resting blur at zero rather than none, so the close interpolates', () => {
    // `none` -> `blur()` is the interpolation that renders as the board
    // snapping into focus at the very end of an otherwise smooth close.
    expect(sheetCss).toContain('filter: blur(0px)')
  })

  it('scales the blur with the visual-quality tier and drops it on Light', () => {
    expect(sheetCss).toContain('--gp-blur-scale')
    expect(sheetCss).toContain("html[data-quality='low'][data-widget-sheet='open'] .gp-canvas-shell")
  })

  it('leaves the board untouched under reduced motion', () => {
    const reduced = sheetCss.slice(sheetCss.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toContain('filter: none')
  })

  it('keeps the board visible enough for the blur to be worth doing', () => {
    // The old 0.3 was tuned for a sheet that covered every pixel. An inset
    // panel puts a band of that board back on screen, where 0.3 under the
    // scrim crushes it to flat black and the blur reads as a plain border.
    expect(sheetRules).toContain('opacity: 0.55')
    expect(sheetRules).not.toContain('opacity: 0.3;')
  })
})

describe('the sheet panel', () => {
  it('takes its margin as padding, keeping the box equal to the viewport', () => {
    // Every rectangle in the flight is in viewport coordinates. Shrinking the
    // box would silently reinterpret all of them.
    expect(sheetCss).toContain('inset: 0;')
    expect(sheetCss).toContain('padding: var(--gp-sheet-margin, 0px)')
  })

  it('draws its edge inside the clip, because clip-path would slice a shadow off', () => {
    expect(sheetCss).toContain('.gp-widget-sheet[data-open]::after')
    expect(sheetCss).toContain('inset 0 0 0 1px')
  })
})
