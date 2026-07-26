import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import {
  RESTING_FACE_INTERACTION_ZOOM,
  nextProgressiveMountStep,
  rectContains,
  usesLightweightWidgetImage,
  virtualWidgetCandidates,
  withEagerPreviewBatch,
  worldRectForViewport,
} from './widgetVirtualization'

function widget(id: string, x: number, y: number): Widget {
  return {
    id,
    type: 'notes',
    title: id,
    canvasId: 'canvas',
    position: { x, y },
    size: { width: 240, height: 160 },
    data: { text: id },
    metadata: { badges: [] },
  }
}

describe('widget viewport virtualization', () => {
  it('converts the screen viewport and its safety gutter into world space', () => {
    expect(worldRectForViewport({
      pan: { x: 100, y: -50 },
      zoom: 0.5,
      viewportSize: { width: 800, height: 600 },
    }, 50)).toEqual({
      x: -300,
      y: 0,
      width: 1800,
      height: 1400,
    })
  })

  it('keeps a smaller camera window inside the retained overscan window', () => {
    expect(rectContains(
      { x: -100, y: -100, width: 1000, height: 800 },
      { x: 0, y: 0, width: 800, height: 600 },
    )).toBe(true)
    expect(rectContains(
      { x: 0, y: 0, width: 800, height: 600 },
      { x: -1, y: 0, width: 800, height: 600 },
    )).toBe(false)
  })

  it('returns only intersecting widgets and hydrates centre-first', () => {
    const widgets = {
      centre: widget('centre', 350, 250),
      edge: widget('edge', 0, 0),
      distant: widget('distant', 5000, 5000),
    }
    const candidates = virtualWidgetCandidates(
      Object.keys(widgets),
      widgets,
      { x: 0, y: 0, width: 800, height: 600 },
      { expandedWidgetId: null },
    )
    expect(candidates.map((candidate) => candidate.id)).toEqual(['centre', 'edge'])
    expect(candidates.every((candidate) => candidate.resting)).toBe(true)
  })

  it('switches to images strictly below 60% unless the widget is urgent', () => {
    expect(usesLightweightWidgetImage(RESTING_FACE_INTERACTION_ZOOM - 0.001, false)).toBe(true)
    expect(usesLightweightWidgetImage(RESTING_FACE_INTERACTION_ZOOM, false)).toBe(false)
    expect(usesLightweightWidgetImage(0.1, true)).toBe(false)
  })
})

describe('progressive widget hydration', () => {
  it('shows a bounded preview batch before idle hydration starts', () => {
    const candidates = Array.from({ length: 80 }, (_, index) => `w${index}`)
    expect(withEagerPreviewBatch(new Set(), candidates)).toEqual(candidates.slice(0, 64))
    expect(withEagerPreviewBatch(new Set(['resident']), candidates, 2)).toEqual([
      'resident',
      'w0',
      'w1',
    ])
  })

  it('loads only one bounded batch while urgent widgets bypass that budget', () => {
    const targets = Array.from({ length: 20 }, (_, index) => `w${index}`)
    const step = nextProgressiveMountStep(new Set(), targets, ['w19'], 4, 6)
    expect(step.liveIds.has('w19')).toBe(true)
    expect(step.liveIds.size).toBe(5)
    expect(step.settled).toBe(false)
  })

  it('releases a bounded batch instead of unmounting hundreds at once', () => {
    const current = new Set(Array.from({ length: 20 }, (_, index) => `w${index}`))
    const step = nextProgressiveMountStep(current, ['w19'], ['w19'], 4, 5)
    expect(current.size - step.liveIds.size).toBe(5)
    expect(step.liveIds.has('w19')).toBe(true)
    expect(step.settled).toBe(false)
  })

  it('eventually settles on exactly the requested live set', () => {
    const target = ['a', 'b', 'c']
    let live: ReadonlySet<string> = new Set(['old-1', 'old-2'])
    let settled = false
    for (let pass = 0; pass < 10 && !settled; pass += 1) {
      const step = nextProgressiveMountStep(live, target, [], 1, 1)
      live = step.liveIds
      settled = step.settled
    }
    expect([...live].sort()).toEqual(target)
    expect(settled).toBe(true)
  })
})
