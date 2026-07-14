import { describe, expect, it } from 'vitest'
import { anchoredCurveMidpoint, anchoredCurvePath } from './curve'

const CASES = [
  {
    label: 'child below parent',
    start: { x: 120, y: 160 }, startCenter: { x: 120, y: 100 },
    end: { x: 420, y: 460 }, endCenter: { x: 420, y: 520 },
  },
  {
    label: 'child beside parent',
    start: { x: 220, y: 130 }, startCenter: { x: 120, y: 100 },
    end: { x: 460, y: 150 }, endCenter: { x: 560, y: 180 },
  },
  {
    label: 'child moved above parent',
    start: { x: 160, y: 300 }, startCenter: { x: 160, y: 240 },
    end: { x: 450, y: -40 }, endCenter: { x: 450, y: 20 },
  },
  {
    label: 'nearly overlapping centers',
    start: { x: 200, y: 220 }, startCenter: { x: 200, y: 200 },
    end: { x: 204, y: 176 }, endCenter: { x: 204, y: 196 },
  },
] as const

describe('anchored relation geometry', () => {
  it.each(CASES)('stays finite and bounded when $label', ({ start, startCenter, end, endCenter }) => {
    const path = anchoredCurvePath(start, startCenter, end, endCenter)
    const midpoint = anchoredCurveMidpoint(start, startCenter, end, endCenter)
    const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
    expect(path).not.toMatch(/NaN|Infinity/)
    expect(numbers.length).toBeGreaterThan(12)
    expect(Number.isFinite(midpoint.x) && Number.isFinite(midpoint.y)).toBe(true)
    const minX = Math.min(start.x, end.x) - 190
    const maxX = Math.max(start.x, end.x) + 190
    const minY = Math.min(start.y, end.y) - 190
    const maxY = Math.max(start.y, end.y) + 190
    for (let index = 0; index < numbers.length; index += 2) {
      expect(numbers[index]).toBeGreaterThanOrEqual(minX)
      expect(numbers[index]).toBeLessThanOrEqual(maxX)
      expect(numbers[index + 1]).toBeGreaterThanOrEqual(minY)
      expect(numbers[index + 1]).toBeLessThanOrEqual(maxY)
    }
    // The middle cubic must never reverse past its escaped endpoints. This is
    // the close-widget case that previously folded a route over itself.
    const escapedStart = { x: numbers[6]!, y: numbers[7]! }
    const middleC1 = { x: numbers[8]!, y: numbers[9]! }
    const middleC2 = { x: numbers[10]!, y: numbers[11]! }
    const escapedEnd = { x: numbers[12]!, y: numbers[13]! }
    for (const control of [middleC1, middleC2]) {
      expect(control.x).toBeGreaterThanOrEqual(Math.min(escapedStart.x, escapedEnd.x))
      expect(control.x).toBeLessThanOrEqual(Math.max(escapedStart.x, escapedEnd.x))
      expect(control.y).toBeGreaterThanOrEqual(Math.min(escapedStart.y, escapedEnd.y))
      expect(control.y).toBeLessThanOrEqual(Math.max(escapedStart.y, escapedEnd.y))
    }
  })
})
