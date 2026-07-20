import { describe, expect, it } from 'vitest'
import { isStrictCanvasSurface } from './canvasEventTarget'

describe('strict empty-canvas targeting', () => {
  it('accepts only the viewport element itself', () => {
    const viewport = new EventTarget()

    expect(isStrictCanvasSurface(viewport, viewport)).toBe(true)
    expect(isStrictCanvasSurface(new EventTarget(), viewport)).toBe(false)
    expect(isStrictCanvasSurface(null, viewport)).toBe(false)
  })
})
