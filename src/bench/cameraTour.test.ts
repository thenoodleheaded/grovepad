import { describe, expect, it } from 'vitest'
import { overviewZoom, tourCameraAt, TOUR_DURATION_MS, type TourWorld } from './cameraTour'

const WORLD: TourWorld = {
  minX: 0,
  minY: 0,
  maxX: 16_000,
  maxY: 12_000,
  viewportWidth: 1280,
  viewportHeight: 800,
}

describe('benchmark camera tour', () => {
  it('yields finite camera state across the whole timeline', () => {
    for (let t = 0; t <= TOUR_DURATION_MS; t += 16) {
      const { pan, zoom } = tourCameraAt(t, WORLD)
      expect(Number.isFinite(pan.x)).toBe(true)
      expect(Number.isFinite(pan.y)).toBe(true)
      expect(Number.isFinite(zoom)).toBe(true)
      expect(zoom).toBeGreaterThan(0)
    }
  })

  it('reaches the far overview mid-tour and returns above working zoom', () => {
    const far = overviewZoom(WORLD)
    expect(far).toBeLessThan(0.2)
    expect(tourCameraAt(13_000, WORLD).zoom).toBeCloseTo(far, 5)
    expect(tourCameraAt(TOUR_DURATION_MS, WORLD).zoom).toBeCloseTo(1.4, 5)
  })

  it('is continuous — no teleports between adjacent frames', () => {
    let previous = tourCameraAt(0, WORLD)
    for (let t = 16; t <= TOUR_DURATION_MS; t += 16) {
      const current = tourCameraAt(t, WORLD)
      const panJump = Math.hypot(current.pan.x - previous.pan.x, current.pan.y - previous.pan.y)
      // Even the fling's fastest frame stays under a viewport-scale jump.
      expect(panJump).toBeLessThan(900)
      expect(Math.abs(current.zoom - previous.zoom)).toBeLessThan(0.2)
      previous = current
    }
  })

  it('clamps outside the timeline instead of extrapolating', () => {
    expect(tourCameraAt(-500, WORLD)).toEqual(tourCameraAt(0, WORLD))
    expect(tourCameraAt(TOUR_DURATION_MS + 500, WORLD)).toEqual(
      tourCameraAt(TOUR_DURATION_MS, WORLD),
    )
  })
})
