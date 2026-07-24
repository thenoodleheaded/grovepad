import { describe, expect, it } from 'vitest'
import { layoutMindmap, type MinifiedMindmap } from './mindmapLayout'

describe('layoutMindmap', () => {
  it('lays imported widgets out through their parent graph without legacy groups', () => {
    const topology: MinifiedMindmap = {
      widgets: [
        { id: 'root', type: 'notes', title: 'Launch plan', sourceRefs: [] },
        { id: 'first', type: 'checklist', title: 'Build', sourceRefs: [] },
        { id: 'second', type: 'decision', title: 'Review', sourceRefs: [] },
      ],
      relations: [
        { from: 'root', to: 'first', type: 'parent' },
        { from: 'root', to: 'second', type: 'parent' },
        { from: 'first', to: 'second', type: 'blocker' },
      ],
    }

    const result = layoutMindmap(topology, 'canvas-1')
    const root = result.widgets[result.idMap.root!]!
    const first = result.widgets[result.idMap.first!]!
    const second = result.widgets[result.idMap.second!]!

    expect(Object.keys(result.widgets)).toHaveLength(3)
    expect(result.relations).toHaveLength(3)
    expect(root.canvasId).toBe('canvas-1')
    expect(root.position.y).toBeLessThan(first.position.y)
    expect(root.position.y).toBeLessThan(second.position.y)
    expect(first.position.x + first.size.width).toBeLessThanOrEqual(second.position.x)
  })
})
