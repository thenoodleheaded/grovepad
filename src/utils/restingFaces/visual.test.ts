import { describe, expect, it } from 'vitest'
import { paperInkRatio, restingFace } from '../restingFace'
import { REST_INK_POINT_BUDGET, REST_STROKE_LIMIT } from '../restingFaceModel'
import { sketchpadRestingFace } from './visual'

type Point = { x: number; y: number; pressure: number }

function stroke(id: string, points: [number, number][]): {
  id: string
  color: string
  size: number
  points: Point[]
} {
  return {
    id,
    color: '#172033',
    size: 4,
    points: points.map(([x, y]) => ({ x, y, pressure: 0.5 })),
  }
}

/** Every numeric pair in a path's data, in order. */
function pathPairs(path: string): [number, number][] {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g) ?? []
  const pairs: [number, number][] = []
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    pairs.push([Number(numbers[index]), Number(numbers[index + 1])])
  }
  return pairs
}

function paperModel(data: Record<string, unknown>) {
  const model = sketchpadRestingFace(data)
  if (model?.kind !== 'paper') throw new Error('expected a paper face')
  return model
}

describe('sketchpad resting ink', () => {
  it('frames the whole picture: every sampled point stays inside the 0–100 box', () => {
    const model = paperModel({
      mode: 'ink',
      strokes: [
        stroke('a', [[0.1, 0.2], [0.9, 0.25]]),
        stroke('b', [[0.4, 0.05], [0.45, 0.95]]),
      ],
    })
    expect(model.ink?.frame).toBe('surface')
    expect(model.ink?.width).toBeCloseTo(0.8, 5)
    expect(model.ink?.height).toBeCloseTo(0.9, 5)
    for (const path of model.strokes) {
      for (const [x, y] of pathPairs(path)) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(100)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(100)
      }
    }
    // The box is filled edge to edge: the extremes reach the padded borders.
    const xs = model.strokes.flatMap((path) => pathPairs(path).map(([x]) => x))
    const ys = model.strokes.flatMap((path) => pathPairs(path).map(([, y]) => y))
    expect(Math.min(...xs)).toBeCloseTo(3, 0)
    expect(Math.max(...xs)).toBeCloseTo(97, 0)
    expect(Math.min(...ys)).toBeCloseTo(3, 0)
    expect(Math.max(...ys)).toBeCloseTo(97, 0)
  })

  it('measures the box over ALL strokes even when the preview keeps a sample', () => {
    const crowd = Array.from({ length: 120 }, (_, index) =>
      stroke(`s-${index}`, [[0.4 + index * 0.001, 0.4], [0.41 + index * 0.001, 0.41]]))
    // The picture's true extremes live in strokes the sample may drop.
    crowd[57] = stroke('far-left', [[0.02, 0.5], [0.05, 0.5]])
    crowd[113] = stroke('far-right', [[0.95, 0.5], [0.98, 0.5]])
    const model = paperModel({ mode: 'ink', strokes: crowd })
    expect(model.strokes.length).toBeLessThanOrEqual(REST_STROKE_LIMIT)
    expect(model.ink?.width).toBeCloseTo(0.96, 5)
  })

  it('spreads the preview across the whole drawing and honours the point budget', () => {
    const many = Array.from({ length: 100 }, (_, index) =>
      stroke(`s-${index}`, Array.from({ length: 500 }, (_, p): [number, number] =>
        [index / 100, p / 500])))
    const model = paperModel({ mode: 'ink', strokes: many })
    expect(model.strokes.length).toBe(REST_STROKE_LIMIT)
    const totalPairs = model.strokes.reduce((sum, path) => sum + pathPairs(path).length, 0)
    // Budget plus at most one preserved endpoint per stroke.
    expect(totalPairs).toBeLessThanOrEqual(REST_INK_POINT_BUDGET + REST_STROKE_LIMIT)
  })

  it('keeps a single dot renderable instead of dividing by zero', () => {
    const model = paperModel({ mode: 'ink', strokes: [stroke('dot', [[0.5, 0.5]])] })
    expect(model.strokes.length).toBe(1)
    expect(model.ink?.width).toBeCloseTo(0.01, 5)
    expect(model.ink?.height).toBeCloseTo(0.01, 5)
  })

  it('turns a diagram scene into ghost outlines with a scene-framed box', () => {
    const model = paperModel({
      mode: 'diagram',
      diagram: {
        elements: [
          { id: 'a', x: 0, y: 0, width: 200, height: 100 },
          { id: 'b', x: 300, y: 50, width: 100, height: 50 },
          { id: 'gone', x: 900, y: 900, width: 10, height: 10, isDeleted: true },
        ],
      },
    })
    expect(model.strokes.length).toBe(2)
    expect(model.ink).toEqual({ width: 400, height: 100, frame: 'scene' })
  })

  it('rests the storyboard on the active frame’s own picture', () => {
    const model = paperModel({
      mode: 'storyboard',
      skinStates: {
        storyboard: {
          activeId: 'frame-2',
          frames: [
            { id: 'frame-1', caption: '', shot: '', strokes: [stroke('x', [[0, 0], [1, 1]])] },
            { id: 'frame-2', caption: 'Chase', shot: 'Wide', strokes: [stroke('y', [[0.2, 0.4], [0.8, 0.6]])] },
          ],
        },
      },
    })
    expect(model.pattern).toBe('frames')
    expect(model.ink?.width).toBeCloseTo(0.6, 5)
    expect(model.ink?.height).toBeCloseTo(0.2, 5)
  })
})

describe('paper tile shape', () => {
  it('folds a wide drawing into a wide tile and a tall drawing into a tall one', () => {
    const wide = restingFace({
      type: 'sketchpad',
      title: 'Ink',
      size: { width: 400, height: 300 },
      data: { height: 240, mode: 'ink', strokes: [stroke('w', [[0, 0.4], [1, 0.6]])] },
    })
    expect(wide.model.kind).toBe('paper')
    expect(wide.size.width).toBeGreaterThan(wide.size.height)

    const tall = restingFace({
      type: 'sketchpad',
      title: 'Ink',
      size: { width: 300, height: 400 },
      data: { height: 240, mode: 'ink', strokes: [stroke('t', [[0.45, 0], [0.55, 1]])] },
    })
    expect(tall.size.height).toBeGreaterThan(tall.size.width)
  })

  it('keeps the fixed paper tile when nothing is drawn', () => {
    const empty = restingFace({
      type: 'sketchpad',
      title: 'Ink',
      size: { width: 400, height: 300 },
      data: { height: 240, mode: 'graph_paper', strokes: [] },
    })
    if (empty.model.kind !== 'paper') throw new Error('expected a paper face')
    expect(paperInkRatio(empty.model, { width: 400, height: 300 })).toBeNull()
    expect(empty.size).toEqual({ width: 160, height: 160 })
  })

  it('clamps a ruler-straight line to a usable ratio', () => {
    const line = paperModel({ mode: 'ink', strokes: [stroke('l', [[0, 0.5], [1, 0.5]])] })
    const ratio = paperInkRatio(line, { width: 400, height: 300 })
    expect(ratio).toBe(3)
  })
})
