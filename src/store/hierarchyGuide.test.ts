import { describe, expect, it } from 'vitest'
import type { Relation, Widget } from '../types/spatial'
import { hierarchyBoundaryGuide } from './hierarchyGuide'

const widget = (id: string, x: number, y: number, width: number, height: number): Widget => ({
  id,
  type: 'notes',
  title: id,
  canvasId: 'canvas',
  position: { x, y },
  size: { width, height },
  data: { text: '' },
  metadata: { badges: [] },
})

const relation = (id: string, fromId: string, toId: string): Relation => ({
  id,
  fromId,
  toId,
  type: 'parent',
  isResolved: true,
})

describe('hierarchy boundary guide', () => {
  it('spans the outer widget edges midway through the direct gap', () => {
    const widgets = {
      parent: widget('parent', 100, 100, 200, 120),
      child: widget('child', 240, 260, 280, 80),
    }
    const guide = hierarchyBoundaryGuide(
      widgets,
      { edge: relation('edge', 'parent', 'child') },
      ['child'],
    )
    expect(guide).toEqual({
      childId: 'child',
      guardianId: 'parent',
      x1: 100,
      x2: 520,
      y: 240,
    })
  })

  it('uses the limiting parent sibling and stays hidden outside one cell', () => {
    const relations = {
      gp: relation('gp', 'grandparent', 'parent'),
      gs: relation('gs', 'grandparent', 'sibling'),
      pc: relation('pc', 'parent', 'child'),
    }
    const widgets = {
      grandparent: widget('grandparent', 0, 0, 200, 80),
      parent: widget('parent', 0, 120, 200, 100),
      sibling: widget('sibling', 320, 120, 200, 140),
      child: widget('child', 120, 300, 200, 80),
    }
    expect(hierarchyBoundaryGuide(widgets, relations, ['child'])?.guardianId).toBe('sibling')

    widgets.child = widget('child', 120, 301, 200, 80)
    expect(hierarchyBoundaryGuide(widgets, relations, ['child'])).toBeNull()
  })
})
