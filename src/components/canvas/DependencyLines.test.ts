import { describe, expect, it } from 'vitest'
import { dependencyAnchors, dependencyStatusLabel } from '../../utils/dependencyGeometry'

describe('dependencyAnchors', () => {
  it('names both the blocked card and its true prerequisite', () => {
    expect(dependencyStatusLabel('Root', ['Research notes'])).toBe('Root waiting on Research notes')
  })
  it('always leaves the prerequisite on the right and enters the dependent on the left', () => {
    const prerequisite = { center: { x: 100, y: 100 }, halfW: 60, halfH: 50 }
    const dependent = { center: { x: 340, y: 180 }, halfW: 80, halfH: 60 }

    expect(dependencyAnchors(prerequisite, dependent)).toEqual({
      start: { x: 168, y: 126 },
      end: { x: 252, y: 144 },
    })
  })

  it('keeps the same directional ports when the dependent sits behind the prerequisite', () => {
    const prerequisite = { center: { x: 300, y: 160 }, halfW: 70, halfH: 40 }
    const dependent = { center: { x: 80, y: 120 }, halfW: 50, halfH: 30 }

    const anchors = dependencyAnchors(prerequisite, dependent)
    expect(anchors.start.x).toBe(378)
    expect(anchors.end.x).toBe(22)
    expect(anchors.start.y).toBe(144)
    expect(anchors.end.y).toBe(126)
  })
})
