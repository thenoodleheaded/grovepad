import { describe, expect, it } from 'vitest'
import { eraseStickyStrokes, stickyStrokes } from './textSkinModel'

describe('Note skin model', () => {
  it('reads sticky ink defensively and drops anything malformed', () => {
    expect(stickyStrokes([{ points: [0.1, 0.2, 0.3, 0.4] }])).toEqual([
      { points: [0.1, 0.2, 0.3, 0.4] },
    ])
    // Out-of-range values are clamped to the surface, an odd tail is half a
    // point, and a stroke too short to be a mark is not one.
    expect(stickyStrokes([{ points: [-1, 2, 0.5, 0.5, 0.7] }])).toEqual([
      { points: [0, 1, 0.5, 0.5] },
    ])
    expect(stickyStrokes([{ points: [0.1, 0.2] }, 'nope', null, {}])).toEqual([])
    expect(stickyStrokes('not ink')).toEqual([])
  })

  it('erases only the strokes the eraser actually passes', () => {
    const near = { points: [0.5, 0.5, 0.52, 0.52] }
    const far = { points: [0.1, 0.1, 0.12, 0.12] }
    expect(eraseStickyStrokes([near, far], 0.5, 0.5, 0.05)).toEqual([far])
    expect(eraseStickyStrokes([near, far], 0.9, 0.9, 0.05)).toEqual([near, far])
  })
})
