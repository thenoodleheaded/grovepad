import { describe, expect, it } from 'vitest'
import type { SketchpadStroke } from '../types/widgetDataCore'
import {
  eraseSketchStrokes,
  normalizedSketchPressure,
  simplifySketchPoints,
  shouldStartSketchStroke,
  sketchPointFromPointer,
  sketchStrokeWidth,
} from './sketchpadStroke'

const stroke: SketchpadStroke = {
  id: 'one',
  color: '#fff',
  size: 4,
  points: [
    { x: 0.1, y: 0.5, pressure: 0.3 },
    { x: 0.9, y: 0.5, pressure: 0.8 },
  ],
}

describe('Pencil sketch stroke policy', () => {
  it('draws with Pencil or mouse; fingers stay reserved for navigation', () => {
    expect(shouldStartSketchStroke('pen')).toBe(true)
    expect(shouldStartSketchStroke('mouse')).toBe(true)
    expect(shouldStartSketchStroke('touch')).toBe(false)
  })

  it('normalizes coordinates and pressure safely', () => {
    expect(sketchPointFromPointer(
      { left: 100, top: 200, width: 200, height: 100 },
      { clientX: 150, clientY: 225, pressure: 0.75, pointerType: 'pen' },
    )).toEqual({ x: 0.25, y: 0.25, pressure: 0.75 })
    expect(normalizedSketchPressure('mouse', 0)).toBe(0.5)
    expect(normalizedSketchPressure('pen', 2)).toBe(1)
  })

  it('uses bounded pressure-responsive widths', () => {
    expect(sketchStrokeWidth(4, 1)).toBeGreaterThan(sketchStrokeWidth(4, 0.1))
    expect(sketchStrokeWidth(0, 0)).toBe(0.75)
  })

  it('erases a whole intersected stroke without touching remote ink', () => {
    expect(eraseSketchStrokes([stroke], { x: 0.5, y: 0.52, pressure: 0.5 }, 8, 400, 200)).toEqual([])
    expect(eraseSketchStrokes([stroke], { x: 0.5, y: 0.9, pressure: 0.5 }, 8, 400, 200)).toEqual([stroke])
  })

  it('removes straight-line polling noise but preserves pressure changes', () => {
    const straight = Array.from({ length: 101 }, (_, index) => ({
      x: index / 100,
      y: 0.5,
      pressure: 0.5,
    }))
    expect(simplifySketchPoints(straight, 500, 200)).toHaveLength(2)

    const pressured = straight.map((point, index) => ({
      ...point,
      pressure: index === 50 ? 1 : point.pressure,
    }))
    expect(simplifySketchPoints(pressured, 500, 200).length).toBeGreaterThan(2)
  })
})
