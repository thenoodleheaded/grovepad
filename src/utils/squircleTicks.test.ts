import { describe, expect, it } from 'vitest'
import { dialTicks, squircleRayHit } from './squircleTicks'

const TWELVE = -Math.PI / 2

describe('squircle ray hit', () => {
  it('lands on the straight runs where the ray leaves through one', () => {
    // Straight up from the centre of a 200×100 box exits the top edge.
    expect(squircleRayHit(200, 100, 20, TWELVE)).toEqual({ x: 100, y: 0 })
    // Straight right exits the right edge.
    const right = squircleRayHit(200, 100, 20, 0)
    expect(right.x).toBeCloseTo(200, 5)
    expect(right.y).toBeCloseTo(50, 5)
  })

  it('lands on the corner arc where the ray leaves through a corner', () => {
    // A square with a full-radius corner is a circle: every hit is one radius
    // from the centre, whatever the angle.
    for (const angle of [0.3, 1.1, 2.4, 4.2, 5.9]) {
      const hit = squircleRayHit(200, 200, 100, angle)
      expect(Math.hypot(hit.x - 100, hit.y - 100)).toBeCloseTo(100, 5)
    }
  })

  it('never returns a point outside the box', () => {
    for (let i = 0; i < 72; i++) {
      const hit = squircleRayHit(240, 160, 22, (i / 72) * Math.PI * 2)
      expect(hit.x).toBeGreaterThanOrEqual(-0.01)
      expect(hit.x).toBeLessThanOrEqual(240.01)
      expect(hit.y).toBeGreaterThanOrEqual(-0.01)
      expect(hit.y).toBeLessThanOrEqual(160.01)
    }
  })

  it('degenerates to a plain rectangle at zero radius', () => {
    expect(squircleRayHit(200, 100, 0, TWELVE)).toEqual({ x: 100, y: 0 })
    const corner = squircleRayHit(200, 200, 0, -Math.PI / 4)
    expect(corner.x).toBeCloseTo(200, 5)
    expect(corner.y).toBeCloseTo(0, 5)
  })
})

describe('dial ticks', () => {
  it('starts at twelve and runs clockwise', () => {
    const ticks = dialTicks(200, 200, 20, 4, 0, 10, 5)
    // Mark 0 is top-centre, pointing inwards.
    expect(ticks[0]!.x1).toBeCloseTo(100, 5)
    expect(ticks[0]!.y1).toBeCloseTo(0, 5)
    expect(ticks[0]!.y2).toBeGreaterThan(ticks[0]!.y1)
    // Then three o'clock, pointing left.
    expect(ticks[1]!.x1).toBeCloseTo(200, 5)
    expect(ticks[1]!.x2).toBeLessThan(ticks[1]!.x1)
  })

  it('aims every mark at the centre — the watch-bezel rule', () => {
    // This is the property the old perimeter-normal construction broke: at the
    // corners its marks aimed along the edge normal, so they fanned inward and
    // bunched. A radial mark's own line always passes through the hub.
    const width = 240
    const height = 160
    const ticks = dialTicks(width, height, 22, 60, 6, 12, 6)
    for (const tick of ticks) {
      const dx = tick.x1 - tick.x2
      const dy = tick.y1 - tick.y2
      // Cross product of (mark direction) and (mark → centre) is zero when
      // the mark is collinear with the centre.
      const toCentreX = width / 2 - tick.x1
      const toCentreY = height / 2 - tick.y1
      expect(Math.abs(dx * toCentreY - dy * toCentreX)).toBeLessThan(0.001)
    }
  })

  it('spaces marks at equal clock angles regardless of the outline', () => {
    const width = 240
    const height = 160
    const ticks = dialTicks(width, height, 22, 12, 0, 10, 10)
    const angles = ticks.map((tick) =>
      Math.atan2(tick.y1 - height / 2, tick.x1 - width / 2),
    )
    for (let i = 1; i < angles.length; i++) {
      let step = angles[i]! - angles[i - 1]!
      if (step < 0) step += Math.PI * 2
      expect(step).toBeCloseTo(Math.PI * 2 / 12, 6)
    }
  })

  it('gives hour marks their own length and flag', () => {
    const ticks = dialTicks(200, 200, 20, 60, 4, 14, 6, 5)
    const hours = ticks.filter((tick) => tick.hour)
    expect(hours).toHaveLength(12)
    expect(hours.every((tick) => tick.index % 5 === 0)).toBe(true)
    const length = (tick: (typeof ticks)[number]) =>
      Math.hypot(tick.x2 - tick.x1, tick.y2 - tick.y1)
    expect(length(ticks[0]!)).toBeCloseTo(14, 5)
    expect(length(ticks[1]!)).toBeCloseTo(6, 5)
  })

  it('returns nothing for a degenerate box', () => {
    expect(dialTicks(0, 100, 10, 12, 2, 6, 3)).toEqual([])
    expect(dialTicks(100, 100, 10, 0, 2, 6, 3)).toEqual([])
  })
})
