import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import { GRID_SIZE, ICON_MIN_EDGE } from '../types/spatial'
import { REST_ROW_LIMIT, restingFace } from './restingFace'

function widget(type: string, data: unknown, overrides: Partial<Widget> = {}): Widget {
  return {
    id: 'w1',
    type,
    title: 'Widget',
    canvasId: 'c1',
    position: { x: 0, y: 0 },
    size: { width: 320, height: 200 },
    data,
    metadata: {},
    ...overrides,
  } as Widget
}

describe('the resting-face law: content decides the face and the tile', () => {
  it('shows real list rows, never an item count', () => {
    const face = restingFace(widget('bullets', {
      items: [
        { id: 'a', text: 'First point' },
        { id: 'b', text: 'Second point' },
      ],
    }))
    expect(face.model.kind).toBe('rows')
    if (face.model.kind !== 'rows') return
    expect(face.model.rows.map((row) => row.label)).toEqual(['First point', 'Second point'])
    expect(face.model.overflow).toBe(0)
  })

  it('carries completion and trailing values into rows', () => {
    const face = restingFace(widget('checklist', {
      items: [
        { id: 'a', label: 'Done thing', done: true },
        { id: 'b', label: 'Open thing', done: false },
      ],
    }))
    if (face.model.kind !== 'rows') throw new Error('expected rows')
    expect(face.model.rows[0]).toMatchObject({ label: 'Done thing', done: true })

    const poll = restingFace(widget('poll', {
      question: 'Lunch?',
      options: [{ id: 'a', text: 'Pizza', votes: 4 }, { id: 'b', text: 'Sushi', votes: 2 }],
    }))
    if (poll.model.kind !== 'rows') throw new Error('expected rows')
    expect(poll.model.rows[0]).toMatchObject({ label: 'Pizza', value: '4' })
  })

  it('bounds rows and reports honest overflow', () => {
    const face = restingFace(widget('checklist', {
      items: Array.from({ length: 10 }, (_, index) => ({ id: `i${index}`, label: `Task ${index}`, done: false })),
    }))
    if (face.model.kind !== 'rows') throw new Error('expected rows')
    expect(face.model.rows).toHaveLength(REST_ROW_LIMIT)
    expect(face.model.overflow).toBe(10 - REST_ROW_LIMIT)
  })

  it('rests an empty widget as a bare icon at the 2x2 floor', () => {
    for (const [type, data] of [
      ['calculator', { input: '', history: [] }],
      ['notes', { text: '' }],
      ['media', { url: '', caption: '' }],
      ['bar_chart', { bars: [] }],
    ] as const) {
      const face = restingFace(widget(type, data))
      expect(face.model.kind, type).toBe('icon')
      // 2x2, the floor every icon-shaped surface obeys — never one cell.
      expect(face.size, type).toEqual({ width: ICON_MIN_EDGE, height: ICON_MIN_EDGE })
    }
  })

  it('rests an image as the image at its own stored footprint', () => {
    const face = restingFace(widget('media', { url: 'https://x/y.png', caption: '' }, {
      size: { width: 260, height: 180 },
    }))
    expect(face.model.kind).toBe('image')
    expect(face.size).toEqual({ width: 260, height: 180 })
  })

  it('shows the widget\'s own words for text widgets', () => {
    const face = restingFace(widget('notes', { text: 'Remember the milk' }))
    expect(face.model).toMatchObject({ kind: 'text', text: 'Remember the milk' })
    expect(face.size.height).toBe(GRID_SIZE)
  })

  it('keeps one-line faces one cell tall', () => {
    for (const [type, data] of [
      ['toggle', { value: true }],
      ['counter', { count: 12 }],
      ['rating', { value: 3 }],
      ['formula', { a: 2, b: 3, operator: 'multiply' }],
    ] as const) {
      expect(restingFace(widget(type, data)).size.height, type).toBe(GRID_SIZE)
    }
  })

  it('sizes on the half-cell lattice and never wider than the cap', () => {
    const face = restingFace(widget('checklist', {
      items: [{ id: 'a', label: 'A very long checklist row label that keeps going and going and going', done: false }],
    }))
    expect(face.size.width % 20).toBe(0)
    expect(face.size.width).toBeLessThanOrEqual(240)
  })

  it('never returns a tile narrower than the title capsule (except icon/image)', () => {
    const face = restingFace(widget('counter', { count: 1 }, { title: 'A rather long widget title' }))
    expect(face.size.width).toBeGreaterThanOrEqual(120)
  })

  it('is cached per widget snapshot', () => {
    const w = widget('counter', { count: 1 })
    expect(restingFace(w)).toBe(restingFace(w))
  })
})
