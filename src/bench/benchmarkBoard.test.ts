import { describe, expect, it } from 'vitest'
import { GRID_SIZE } from '../types/spatial'
import { WIDGET_REGISTRY } from '../widgets/registry'
import { fieldsFor } from '../widgets/fields'
import { DEFAULT_BENCHMARK_CONFIG, generateBenchmarkBoard } from './benchmarkBoard'

const CONFIG = {
  ...DEFAULT_BENCHMARK_CONFIG,
  workspaceId: 'ws-test',
  parentCanvasId: 'canvas-root',
}

describe('benchmark board generator', () => {
  it('is deterministic for a given seed and diverges for another', () => {
    const a = generateBenchmarkBoard(CONFIG)
    const b = generateBenchmarkBoard(CONFIG)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const c = generateBenchmarkBoard({ ...CONFIG, seed: CONFIG.seed + 1 })
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a))
  })

  it('produces the contracted scale: 2,000 widgets and several hundred edges', () => {
    const board = generateBenchmarkBoard(CONFIG)
    expect(Object.keys(board.widgets)).toHaveLength(CONFIG.widgetCount)
    const edges =
      Object.keys(board.relations).length + Object.keys(board.connections).length
    expect(edges).toBeGreaterThanOrEqual(300)
    expect(Object.keys(board.groups).length).toBeGreaterThanOrEqual(30)
  })

  it('emits only registry-valid types, grid-snapped geometry, one canvas', () => {
    const board = generateBenchmarkBoard(CONFIG)
    for (const widget of Object.values(board.widgets)) {
      expect(WIDGET_REGISTRY[widget.type]).toBeDefined()
      expect(widget.canvasId).toBe(board.canvas.id)
      expect(widget.position.x % GRID_SIZE).toBe(0)
      expect(widget.position.y % GRID_SIZE).toBe(0)
      expect(Number.isFinite(widget.size.width)).toBe(true)
      expect(widget.size.width).toBeGreaterThan(0)
    }
    expect(board.canvas.workspaceId).toBe('ws-test')
    expect(board.canvas.parentCanvasId).toBe('canvas-root')
  })

  it('wires only fields the circuit engine could have connected itself', () => {
    const board = generateBenchmarkBoard(CONFIG)
    expect(Object.keys(board.connections).length).toBeGreaterThanOrEqual(100)
    for (const wire of Object.values(board.connections)) {
      const fromKeys = fieldsFor(board.widgets[wire.fromId]!.type).map((f) => f.key)
      const settable = fieldsFor(board.widgets[wire.toId]!.type)
        .filter((f) => f.set)
        .map((f) => f.key)
      expect(fromKeys).toContain(wire.fromField)
      expect(settable).toContain(wire.toField)
      expect(wire.kind).toBe('value')
    }
  })

  it('reports bounds that contain every widget', () => {
    const board = generateBenchmarkBoard(CONFIG)
    for (const widget of Object.values(board.widgets)) {
      expect(widget.position.x).toBeGreaterThanOrEqual(board.bounds.minX)
      expect(widget.position.y).toBeGreaterThanOrEqual(board.bounds.minY)
      expect(widget.position.x + widget.size.width).toBeLessThanOrEqual(board.bounds.maxX)
      expect(widget.position.y + widget.size.height).toBeLessThanOrEqual(board.bounds.maxY)
    }
  })
})
