import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import { GRID_SIZE, ICON_MIN_EDGE } from '../types/spatial'
import {
  NOTE_REST_MAX_WIDTH,
  REST_ROW_LIMIT,
  restingFace,
} from './restingFace'

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

    // A poll's point is relative standing, so its trailing value is the share
    // rather than the raw count, and the leading option leads the rows.
    const poll = restingFace(widget('poll', {
      question: 'Lunch?',
      options: [{ id: 'a', label: 'Pizza', votes: 4 }, { id: 'b', label: 'Sushi', votes: 2 }],
    }))
    if (poll.model.kind !== 'rows') throw new Error('expected rows')
    expect(poll.model.rows[0]).toMatchObject({ label: 'Pizza', value: '66.7%' })
    expect(poll.model.rows[1]).toMatchObject({ label: 'Sushi', value: '33.3%' })
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
      ['text', { text: '' }],
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

  it('rests a written note as its own page, at a fraction of the open card', () => {
    // A Note face carries no preview: the tile renders the card's own page
    // (TextRestPage) scaled down, so there is no reading here to assert —
    // only which skin's page it is, and the box it is drawn in.
    const face = restingFace(widget('text', { text: 'Remember the milk' }, {
      size: { width: 320, height: 200 },
    }))
    expect(face.model).toEqual({ kind: 'note', skin: 'plain' })
    // Narrower and shorter than the card, on the lattice, and never wider.
    expect(face.size.width).toBeLessThan(320)
    expect(face.size.height).toBeLessThan(200)
    expect(face.size.width % GRID_SIZE).toBe(0)
    expect(face.size.height % GRID_SIZE).toBe(0)
  })

  it('scales the Note tile with the card, so a wider note rests wider', () => {
    const narrow = restingFace(widget('text', { text: 'Remember the milk' }, {
      size: { width: 240, height: 160 },
    }))
    const wide = restingFace(widget('text', { text: 'Remember the milk' }, {
      size: { width: 520, height: 160 },
    }))
    expect(wide.size.width).toBeGreaterThan(narrow.size.width)
  })

  it('rests a Sticky closer to its open size than the other skins', () => {
    const plain = restingFace(widget('text', { text: 'Same words', mode: 'plain' }, {
      size: { width: 400, height: 200 },
    }))
    const sticky = restingFace(widget('text', { text: 'Same words', mode: 'sticky' }, {
      size: { width: 400, height: 200 },
    }))
    expect(sticky.size.width).toBeGreaterThan(plain.size.width)
  })

  it.each([
    'plain',
    'sticky',
    'typewriter',
  ] as const)('gives the %s Note skin its own resting model', (mode) => {
    const face = restingFace(widget('text', {
      text: '# Heading\n- First point\nA useful sentence',
      mode,
      color: 'pink',
    }))
    expect(face.model).toMatchObject({ kind: 'note', skin: mode })
  })

  it('keeps Note previews bounded regardless of document size', () => {
    const face = restingFace(widget('text', {
      mode: 'typewriter',
      text: Array.from({ length: 100 }, (_, index) => `Line ${index} with enough text to wrap across the preview`).join('\n'),
    }))
    // The page is unbounded writing, but the TILE is not: it stays a fixed
    // fraction of the card no matter how long the document.
    expect(face.model).toEqual({ kind: 'note', skin: 'typewriter' })
    expect(face.size.width).toBeLessThanOrEqual(NOTE_REST_MAX_WIDTH)
  })

  it('rests a note with only ink as a note', () => {
    const inked = restingFace(widget('text', {
      mode: 'sticky',
      text: '',
      skinStates: { sticky: { strokes: [{ points: [0.1, 0.2, 0.3, 0.4] }] } },
    }))
    expect(inked.model.kind).toBe('note')
  })

  it('keeps one-line faces one cell tall', () => {
    for (const [type, data] of [
      ['toggle', { value: true }],
      ['rating', { value: 3 }],
      ['number_input', { label: 'Volume', value: 7, min: 0, max: 10, step: 1 }],
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
