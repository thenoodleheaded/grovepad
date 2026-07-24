import { describe, expect, it } from 'vitest'
import type { Relation, Widget } from '../types/spatial'
import {
  applyWidgetDelta,
  hierarchyChildrenGuardedBy,
  hierarchyGuardiansForChild,
  minimumHierarchyChildTop,
} from './widgetCollection'
import { LAYOUT_GAP, MIN_PARENT_CHILD_GAP } from './widgetLayoutConstants'

const widget = (id: string, y: number, height = 120): Widget => ({
  id,
  type: 'notes',
  title: id,
  canvasId: 'canvas',
  position: { x: 0, y },
  size: { width: 200, height },
  data: { text: '' },
  metadata: { badges: [] },
})
const parent = (id: string, fromId: string, toId: string): Relation => ({
  id,
  fromId,
  toId,
  type: 'parent',
  isResolved: true,
})

describe('strict hierarchy boundaries', () => {
  it('uses a zero-cell hierarchy gap without changing direct collision spacing', () => {
    expect(MIN_PARENT_CHILD_GAP).toBe(0)
    expect(LAYOUT_GAP).toBeGreaterThan(0)

    const widgets = {
      p: widget('p', 0, 120),
      c: widget('c', 300, 80),
    }
    const relations = { pc: parent('pc', 'p', 'c') }
    const moved = applyWidgetDelta(widgets, relations, ['c'], { x: 0, y: -1_000 })

    expect(moved.c!.position.y).toBe(120)
  })

  it('keeps a child below the lowest bottom edge in its parent sibling row', () => {
    const widgets = {
      grandparent: widget('grandparent', 0),
      parent: widget('parent', 200, 100),
      sibling: widget('sibling', 280, 180),
      child: widget('child', 700, 80),
    }
    const relations = {
      gp: parent('gp', 'grandparent', 'parent'),
      gs: parent('gs', 'grandparent', 'sibling'),
      pc: parent('pc', 'parent', 'child'),
    }

    expect(hierarchyGuardiansForChild('child', relations)).toEqual(
      expect.arrayContaining(['parent', 'sibling']),
    )
    expect(minimumHierarchyChildTop('parent', widgets, relations)).toBe(460)

    const moved = applyWidgetDelta(widgets, relations, ['child'], { x: 0, y: -1_000 })
    expect(moved.child!.position.y).toBe(460)
  })

  it('stops any parent sibling from crossing below a guarded child', () => {
    const widgets = {
      grandparent: widget('grandparent', 0),
      parent: widget('parent', 200, 100),
      sibling: widget('sibling', 200, 100),
      child: widget('child', 500, 80),
    }
    const relations = {
      gp: parent('gp', 'grandparent', 'parent'),
      gs: parent('gs', 'grandparent', 'sibling'),
      pc: parent('pc', 'parent', 'child'),
    }

    expect(hierarchyChildrenGuardedBy('sibling', relations)).toContain('child')
    const moved = applyWidgetDelta(widgets, relations, ['sibling'], { x: 0, y: 1_000 })
    expect(moved.sibling!.position.y).toBe(400)
  })

  it('leaves every hierarchy boundary disabled for a free canvas', () => {
    const widgets = {
      p: widget('p', 0, 120),
      c: widget('c', 300, 80),
    }
    const relations = { pc: parent('pc', 'p', 'c') }
    const moved = applyWidgetDelta(widgets, relations, ['c'], { x: 0, y: -500 }, false)
    expect(moved.c!.position.y).toBe(-200)
  })
})
