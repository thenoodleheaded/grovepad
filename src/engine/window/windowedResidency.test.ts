import { describe, expect, it } from 'vitest'
import {
  computeResidency,
  FULL_TIER_MIN_SCREEN_WIDTH,
  type ResidencyEntry,
  type ResidencyInput,
} from './windowedResidency'

// View: world rect 0..1000 × 0..800, center (500, 400). At scale 1 the enter
// ring spans -500..1500 × -400..1200 and the exit ring -1100..2100 × -880..1680.
const view = { x: 0, y: 0, width: 1000, height: 800 }

function entry(id: string, x: number, y = 325, width = 200, height = 150): ResidencyEntry {
  return { id, x, y, width, height }
}

function residency(overrides: Partial<ResidencyInput>): ReturnType<typeof computeResidency> {
  return computeResidency({
    entries: [],
    view,
    zoom: 1,
    panVelocity: { x: 0, y: 0 },
    pinnedIds: new Set(),
    previousMounted: new Set(),
    previousFull: new Set(),
    allowUnmount: true,
    mountBatch: 100,
    fullBudget: 100,
    mountedBudget: 100,
    ...overrides,
  })
}

describe('windowed residency', () => {
  it('mounts entries in the enter ring and leaves the rest without DOM', () => {
    const result = residency({
      entries: [entry('near', 400), entry('edge', 1400), entry('far', 2000)],
    })
    expect(result.mountedIds).toEqual(['edge', 'near'])
  })

  it('stretches the enter ring ahead of camera travel, not behind it', () => {
    const entries = [entry('ahead', 2500), entry('behind', -2200)]
    expect(residency({ entries }).mountedIds).toEqual([])
    // Content flowing left at saturation speed = camera traveling toward +x.
    const moving = residency({ entries, panVelocity: { x: -2400, y: 0 } })
    expect(moving.mountedIds).toEqual(['ahead'])
  })

  it('keeps a resident widget until it leaves the larger exit ring', () => {
    const result = residency({
      entries: [entry('kept', 1900), entry('gone', 2300)],
      previousMounted: new Set(['kept', 'gone']),
    })
    expect(result.mountedIds).toEqual(['kept'])
  })

  it('never unmounts while the caller forbids teardown (mid-gesture)', () => {
    const result = residency({
      entries: [entry('gone', 2300)],
      previousMounted: new Set(['gone']),
      allowUnmount: false,
    })
    expect(result.mountedIds).toEqual(['gone'])
  })

  it('caps new mounts per flush at the batch size, nearest first', () => {
    const result = residency({
      entries: [entry('a', 500), entry('b', 700), entry('c', 900), entry('d', 1100)],
      mountBatch: 2,
    })
    expect(result.mountedIds).toEqual(['a', 'b'])
  })

  it('spends the mounted budget on resident widgets before new ones', () => {
    const result = residency({
      entries: [entry('n1', 500), entry('n2', 700), entry('old', 1900)],
      previousMounted: new Set(['old']),
      mountedBudget: 2,
    })
    expect(result.mountedIds).toEqual(['n1', 'old'])
  })

  it('pins mount and stay full even far outside every ring', () => {
    const result = residency({
      entries: [entry('p', 5000, 5000)],
      pinnedIds: new Set(['p']),
    })
    expect(result.mountedIds).toEqual(['p'])
    expect(result.fullIds.has('p')).toBe(true)
  })

  it('keeps small-on-screen cards primitive until they are readable', () => {
    const entries = [entry('a', 400)]
    const small = residency({ entries, zoom: 0.5 })
    expect(small.mountedIds).toEqual(['a'])
    expect(small.fullIds.size).toBe(0)
    expect(residency({ entries, zoom: 1 }).fullIds.has('a')).toBe(true)
  })

  it('holds full tier through zoom jitter at the readability boundary', () => {
    const entries = [entry('h', 400)]
    // 200px × 0.7 zoom = 140 on-screen px: below entry, above the exit floor.
    const zoom = (FULL_TIER_MIN_SCREEN_WIDTH - 10) / 200
    expect(residency({ entries, zoom }).fullIds.size).toBe(0)
    const held = residency({
      entries,
      zoom,
      previousMounted: new Set(['h']),
      previousFull: new Set(['h']),
    })
    expect(held.fullIds.has('h')).toBe(true)
  })

  it('grants full tier to the nearest readable cards up to the budget', () => {
    const result = residency({
      entries: [entry('b', 700), entry('a', 500)],
      fullBudget: 1,
    })
    expect(result.mountedIds).toEqual(['a', 'b'])
    expect([...result.fullIds]).toEqual(['a'])
  })

  it('denies full tier to widgets kept only by exit-ring hysteresis', () => {
    const result = residency({
      entries: [entry('kept', 1900)],
      previousMounted: new Set(['kept']),
    })
    expect(result.mountedIds).toEqual(['kept'])
    expect(result.fullIds.size).toBe(0)
  })
})
