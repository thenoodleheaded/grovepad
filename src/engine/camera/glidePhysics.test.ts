import { describe, expect, it } from 'vitest'
import { FLING_MAX_SPEED, flingVelocity, trimSamples } from './glidePhysics'

describe('fling physics', () => {
  it('derives release velocity from the recent sample window', () => {
    const samples = [
      { x: 0, y: 0, time: 0 },
      { x: 60, y: 0, time: 60 },
      { x: 120, y: 0, time: 120 },
    ]
    const v = flingVelocity(samples)
    expect(v.x).toBeCloseTo(1000)
    expect(v.y).toBe(0)
  })

  it('reads a finger that stopped before lifting as zero velocity', () => {
    const samples = [
      { x: 0, y: 0, time: 0 },
      { x: 400, y: 0, time: 40 },
      { x: 400, y: 0, time: 300 }, // held still, then released
    ]
    expect(flingVelocity(samples)).toEqual({ x: 0, y: 0 })
  })

  it('caps runaway velocities and ignores sub-threshold releases', () => {
    const wild = flingVelocity([
      { x: 0, y: 0, time: 0 },
      { x: 9000, y: 0, time: 100 },
    ])
    expect(Math.hypot(wild.x, wild.y)).toBeLessThanOrEqual(FLING_MAX_SPEED + 1e-6)
    expect(
      flingVelocity([
        { x: 0, y: 0, time: 0 },
        { x: 2, y: 0, time: 100 },
      ]),
    ).toEqual({ x: 0, y: 0 })
  })

  it('trims the trail to the window while keeping at least two samples', () => {
    const samples = [
      { x: 0, y: 0, time: 0 },
      { x: 1, y: 0, time: 10 },
      { x: 2, y: 0, time: 500 },
      { x: 3, y: 0, time: 510 },
    ]
    trimSamples(samples, 510)
    expect(samples.length).toBe(2)
    expect(samples[0]!.time).toBe(500)
  })
})
