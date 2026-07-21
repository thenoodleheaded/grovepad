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
    allowPromote: true,
    preserveFull: false,
    mountBatch: 100,
    promoteBatch: 100,
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

  it('skips the readability gate when the whole board fits the full budget', () => {
    // Five cards, budget 32: no scarcity — full tier at ANY zoom, exactly
    // like a small board always rendered before tiers existed.
    const entries = [entry('a', 400), entry('b', 700)]
    const tiny = residency({ entries, zoom: 0.1, fullBudget: 32 })
    expect(tiny.fullIds.size).toBe(2)
  })

  it('keeps small-on-screen cards primitive when the budget is scarce', () => {
    // More candidates than budget: the gate rations glass toward readable
    // cards, so a sub-threshold card stays primitive.
    const entries = Array.from({ length: 5 }, (_, i) => entry(`w${i}`, 200 + i * 90))
    const small = residency({ entries, zoom: 0.4, fullBudget: 4 })
    expect(small.mountedIds).toHaveLength(5)
    expect(small.fullIds.size).toBe(0)
    const readable = residency({ entries, zoom: 1, fullBudget: 4 })
    expect(readable.fullIds.size).toBe(4)
  })

  it('holds full tier through zoom jitter at the readability boundary', () => {
    // Two candidates vs budget 1 keeps the gate active (scarcity).
    const entries = [entry('h', 400), entry('other', 700)]
    // 200px × 0.7 zoom = 140 on-screen px: below entry, above the exit floor.
    const zoom = (FULL_TIER_MIN_SCREEN_WIDTH - 10) / 200
    expect(residency({ entries, zoom, fullBudget: 1 }).fullIds.size).toBe(0)
    const held = residency({
      entries,
      zoom,
      fullBudget: 1,
      previousMounted: new Set(['h', 'other']),
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

  it('freezes tier membership at fast motion: no promotions, no demotions', () => {
    const entries = [entry('was-full', 700), entry('closer', 400)]
    const result = residency({
      entries,
      allowPromote: false,
      preserveFull: true,
      previousMounted: new Set(['was-full', 'closer']),
      previousFull: new Set(['was-full']),
      fullBudget: 1,
    })
    // 'closer' would win the budget at idle; at fast motion the incumbent holds.
    expect([...result.fullIds]).toEqual(['was-full'])
  })

  it('still promotes pins while the tier is frozen', () => {
    const result = residency({
      entries: [entry('pinned', 400)],
      allowPromote: false,
      preserveFull: true,
      pinnedIds: new Set(['pinned']),
    })
    expect(result.fullIds.has('pinned')).toBe(true)
  })

  it('promotes newcomers but never demotes during slow motion', () => {
    // 'moving' tier: preserveFull keeps the incumbent, allowPromote adds the
    // newcomer — a slow pan navigates over real faces, none flip to generic.
    const entries = [entry('incumbent-far', 1400), entry('newcomer-near', 400)]
    const result = residency({
      entries,
      allowPromote: true,
      preserveFull: true,
      previousMounted: new Set(['incumbent-far', 'newcomer-near']),
      previousFull: new Set(['incumbent-far']),
    })
    // Incumbent held even though it drifted out of the enter ring (no demote),
    // and the newcomer promoted.
    expect(result.fullIds.has('incumbent-far')).toBe(true)
    expect(result.fullIds.has('newcomer-near')).toBe(true)
  })

  it('staggers full-tier promotions across passes, incumbents unaffected', () => {
    const entries = [entry('inc', 400), entry('n1', 500), entry('n2', 600), entry('n3', 700)]
    const result = residency({
      entries,
      previousMounted: new Set(['inc', 'n1', 'n2', 'n3']),
      previousFull: new Set(['inc']),
      promoteBatch: 2,
    })
    // Incumbent stays; only two of the three newcomers promote this pass.
    expect(result.fullIds.has('inc')).toBe(true)
    expect(result.fullIds.size).toBe(3)
  })

  it('drops a frozen full card only if it unmounts entirely', () => {
    const result = residency({
      entries: [entry('gone-full', 2300)],
      allowPromote: false,
      preserveFull: true,
      allowUnmount: false,
      previousMounted: new Set(['gone-full']),
      previousFull: new Set(['gone-full']),
    })
    // Not unmounted (mid-gesture) → stays mounted AND stays full.
    expect(result.mountedIds).toEqual(['gone-full'])
    expect(result.fullIds.has('gone-full')).toBe(true)
  })
})
