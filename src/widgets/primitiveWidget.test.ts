import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import { PrimitiveWidgetFlag, hasPrimitiveFlag, primitiveWidget } from './primitiveWidget'

function note(overrides: Partial<Widget> = {}): Widget {
  return {
    id: 'note-1',
    type: 'notes',
    title: 'Project notes',
    canvasId: 'canvas-1',
    position: { x: 40, y: 80 },
    size: { width: 320, height: 240 },
    data: { text: 'A lightweight passive preview' },
    metadata: { badges: [] },
    ...overrides,
  }
}

describe('primitive widget projection', () => {
  it('flattens hot geometry and state without retaining the rich data object', () => {
    const source = note({
      collapsed: true,
      expandedSize: { width: 400, height: 280 },
      metadata: { badges: [], locked: true, favorite: true, zIndex: 7 },
    })
    const projected = primitiveWidget(source)

    expect(projected).toMatchObject({
      id: 'note-1',
      x: 40,
      y: 80,
      width: 320,
      height: 240,
      expandedWidth: 400,
      expandedHeight: 280,
      zIndex: 7,
    })
    expect(hasPrimitiveFlag(projected, PrimitiveWidgetFlag.Collapsed)).toBe(true)
    expect(hasPrimitiveFlag(projected, PrimitiveWidgetFlag.Locked)).toBe(true)
    expect(hasPrimitiveFlag(projected, PrimitiveWidgetFlag.Favorite)).toBe(true)
    expect(projected).not.toHaveProperty('data')
    expect(projected).not.toHaveProperty('metadata')
  })

  it('reuses a projection while the canonical widget object is unchanged', () => {
    const source = note()
    expect(primitiveWidget(source)).toBe(primitiveWidget(source))
    expect(primitiveWidget({ ...source })).not.toBe(primitiveWidget(source))
  })

  it('keeps readable note content in the passive visual packet', () => {
    expect(primitiveWidget(note()).visual).toEqual({
      kind: 'text',
      primary: 'A lightweight passive preview',
      secondary: undefined,
      rows: [],
    })
  })

  it('guarantees a non-blank face: sparse extraction gains resting furniture', () => {
    // An empty notes widget extracts nothing — the real renderer would still
    // show its writing well, so the primitive must show furniture, not a
    // blank slab (measured: 17 of 94 registry types extracted nothing and
    // rendered as empty rectangles at far zoom).
    const empty = primitiveWidget(note({ data: { text: '' } }))
    expect(empty.visual.furniture).toBe('text')

    // Rich extraction carries the face itself — no furniture.
    const rich = primitiveWidget(note({ id: 'note-2', data: { text: 'Plenty of body text here' } }))
    expect(rich.visual.furniture).toBeUndefined()

    // Category steers the archetype: an empty tracking widget reads metric.
    const tracker = primitiveWidget(
      note({ id: 'note-3', type: 'goal_tracker', data: {} as Widget['data'] }),
    )
    expect(tracker.visual.furniture).toBe('metric')
  })

  it('bounds list previews so large payloads cannot create unbounded DOM', () => {
    const source = note({
      type: 'checklist',
      data: {
        items: Array.from({ length: 40 }, (_, index) => ({
          id: String(index),
          label: `Task ${index}`,
          done: index % 2 === 0,
        })),
      },
    })
    expect(primitiveWidget(source).visual.rows).toHaveLength(7)
  })
})
