import { describe, expect, it } from 'vitest'
import { restingImageScale } from './useWidgetResize'

// A resting image is ratio-locked, so one axis has to supply the factor. It
// must be the axis the drag came from: reading a vertical pull off the card's
// width scales a portrait photo by a wildly wrong amount.
describe('resting image scale', () => {
  const PORTRAIT = { width: 100, height: 400 }

  it('reads a vertical pull off the height', () => {
    // Bottom edge dragged 40 px up: 360/400.
    expect(restingImageScale(PORTRAIT.width, PORTRAIT.height, { x: 0, y: 1 }, { x: 0, y: -40 }))
      .toBeCloseTo(0.9)
    // Down 40 px: 440/400, still inside the 560/400 ceiling.
    expect(restingImageScale(PORTRAIT.width, PORTRAIT.height, { x: 0, y: 1 }, { x: 0, y: 40 }))
      .toBeCloseTo(1.1)
  })

  it('reads a horizontal pull off the width', () => {
    // Right edge dragged 20 px out: 120/100.
    expect(restingImageScale(PORTRAIT.width, PORTRAIT.height, { x: 1, y: 0 }, { x: 20, y: 0 }))
      .toBeCloseTo(1.2)
  })

  it('takes the horizontal axis on a corner, where both are in play', () => {
    expect(restingImageScale(PORTRAIT.width, PORTRAIT.height, { x: 1, y: 1 }, { x: 20, y: 200 }))
      .toBeCloseTo(1.2)
  })

  it('holds both edges inside the photograph bounds', () => {
    // Smallest edge floors at 80: 80/100.
    expect(restingImageScale(PORTRAIT.width, PORTRAIT.height, { x: 0, y: 1 }, { x: 0, y: -300 }))
      .toBeCloseTo(0.8)
    // Longest edge ceilings at 560: 560/400.
    expect(restingImageScale(PORTRAIT.width, PORTRAIT.height, { x: 0, y: 1 }, { x: 0, y: 900 }))
      .toBeCloseTo(1.4)
  })
})
