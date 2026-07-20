import { describe, expect, it } from 'vitest'
import { kineticPanFrame, kineticVelocity, shouldStartKineticPan } from './kineticPan'

describe('kinetic touch panning', () => {
  it('uses only the recent gesture tail so a pause cancels a fling', () => {
    expect(kineticVelocity([
      { x: 0, y: 0, time: 0 },
      { x: 100, y: 0, time: 20 },
      { x: 100, y: 0, time: 120 },
    ])).toEqual({ x: 0, y: 0 })
  })

  it('caps pathological velocity and decays monotonically', () => {
    const velocity = kineticVelocity([
      { x: 0, y: 0, time: 0 },
      { x: 1000, y: 0, time: 10 },
    ])
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(2.4)
    const first = kineticPanFrame(velocity, 16)
    const second = kineticPanFrame(first.velocity, 16)
    expect(Math.hypot(second.velocity.x, second.velocity.y)).toBeLessThan(
      Math.hypot(first.velocity.x, first.velocity.y),
    )
    expect(first.delta.x).toBeGreaterThan(0)
  })

  it('clamps a delayed frame so returning to the tab cannot jump the board', () => {
    expect(kineticPanFrame({ x: 1, y: 0 }, 1000).delta.x).toBe(32)
  })

  it('never flings after cancellation, pinching, mouse input, or selection', () => {
    const base = {
      eventType: 'pointerup',
      pointerType: 'touch',
      activeGesture: 'pan',
      touchCountBeforeRelease: 1,
    }
    expect(shouldStartKineticPan(base)).toBe(true)
    expect(shouldStartKineticPan({ ...base, eventType: 'pointercancel' })).toBe(false)
    expect(shouldStartKineticPan({ ...base, touchCountBeforeRelease: 2 })).toBe(false)
    expect(shouldStartKineticPan({ ...base, pointerType: 'mouse' })).toBe(false)
    expect(shouldStartKineticPan({ ...base, activeGesture: 'select' })).toBe(false)
  })
})
