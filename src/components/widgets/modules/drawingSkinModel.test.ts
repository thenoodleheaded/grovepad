import { describe, expect, it } from 'vitest'
import {
  annotationState,
  drawingContentCount,
  drawingDisplayColor,
  drawingMode,
  safeDrawingReferenceUrl,
  storyboardState,
} from './drawingSkinModel'

describe('Drawing skin model', () => {
  it('recognizes every installed drawing mode and safely falls back', () => {
    expect([
      'ink',
      'whiteboard',
      'graph_paper',
      'dot_grid',
      'storyboard',
      'annotation',
      'diagram',
    ].map(drawingMode)).toEqual([
      'ink',
      'whiteboard',
      'graph_paper',
      'dot_grid',
      'storyboard',
      'annotation',
      'diagram',
    ])
    expect(drawingMode('unknown')).toBe('ink')
  })

  it('sanitizes storyboard frames and preserves independent marks', () => {
    const state = storyboardState({
      activeId: 'second',
      frames: [
        { id: 'first', caption: 'Opening', shot: 'Wide', strokes: [] },
        {
          id: 'second',
          caption: 'Reveal',
          shot: 'CU',
          strokes: [{
            id: 'line',
            color: '#172033',
            size: 4,
            points: [{ x: 2, y: -1, pressure: 2 }],
          }],
        },
        { id: 'second', caption: 'Duplicate', strokes: [] },
      ],
    })
    expect(state.activeId).toBe('second')
    expect(state.frames).toHaveLength(2)
    expect(state.frames[1]?.strokes[0]?.points[0]).toEqual({ x: 1, y: 0, pressure: 1 })
    expect(drawingContentCount('storyboard', [], [], state)).toBe(1)
  })

  it('creates useful default frames and bounds annotation controls', () => {
    expect(storyboardState(null).frames).toHaveLength(4)
    expect(annotationState({
      sourceUrl: 'https://example.com/reference.png',
      opacity: 5,
      mimeType: 'image/png',
    })).toMatchObject({
      sourceUrl: 'https://example.com/reference.png',
      opacity: 1,
      mimeType: 'image/png',
    })
    expect(annotationState({ opacity: 0 }).opacity).toBe(0.15)
    expect(safeDrawingReferenceUrl('https://example.com/ref.pdf')).toBe('https://example.com/ref.pdf')
    expect(safeDrawingReferenceUrl('javascript:alert(1)')).toBe('')
    expect(drawingDisplayColor('#f8fafc', 'graph_paper')).toBe('#172033')
    expect(drawingDisplayColor('#f8fafc', 'ink')).toBe('#f8fafc')
    expect(drawingDisplayColor('#2563eb', 'whiteboard')).toBe('#2563eb')
  })
})
