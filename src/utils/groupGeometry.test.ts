import { describe, expect, it } from 'vitest'
import type { Widget, WidgetGroup } from '../types/spatial'
import {
  groupAtWorldPoint,
  groupWorldBoundsExcluding,
  worldRectContainsPoint,
} from './groupGeometry'

function widget(id: string, canvasId: string, x: number, y: number): Widget {
  return {
    id,
    canvasId,
    type: 'notes',
    title: id,
    position: { x, y },
    size: { width: 240, height: 160 },
    data: { text: '' },
    metadata: { badges: [] },
  }
}

describe('group cursor targeting', () => {
  it('uses the cursor point, including the technical padded edge', () => {
    const widgets = {
      a: widget('a', 'canvas-a', 100, 100),
      b: widget('b', 'canvas-a', 380, 100),
      dragged: widget('dragged', 'canvas-a', -2_000, -2_000),
    }
    const groups: Record<string, WidgetGroup> = {
      group: { id: 'group', label: 'Group', widgetIds: ['a', 'b'], color: '#6366f1' },
    }

    expect(groupAtWorldPoint({ x: 70, y: 120 }, groups, widgets, { canvasId: 'canvas-a' })).toBe('group')
    expect(groupAtWorldPoint({ x: 61, y: 120 }, groups, widgets, { canvasId: 'canvas-a' })).toBeNull()
  })

  it('ignores the current group and groups on another canvas', () => {
    const widgets = {
      a: widget('a', 'canvas-a', 100, 100),
      b: widget('b', 'canvas-a', 380, 100),
    }
    const groups: Record<string, WidgetGroup> = {
      group: { id: 'group', label: 'Group', widgetIds: ['a', 'b'], color: '#6366f1' },
    }

    expect(groupAtWorldPoint({ x: 120, y: 120 }, groups, widgets, {
      canvasId: 'canvas-a',
      excludeGroupId: 'group',
    })).toBeNull()
    expect(groupAtWorldPoint({ x: 120, y: 120 }, groups, widgets, { canvasId: 'canvas-b' })).toBeNull()
  })

  it('keeps a stable member-retention boundary while one widget is dragged', () => {
    const group: WidgetGroup = {
      id: 'group',
      label: 'Group',
      color: '#6366f1',
      widgetIds: ['a', 'b'],
    }
    const widgets = {
      a: widget('a', 'canvas-a', 0, 0),
      b: widget('b', 'canvas-a', 400, 0),
    }
    const retention = groupWorldBoundsExcluding(group, widgets, 'b')
    // Remaining member 'a' (240 wide, grouped -> detach button pushes it into
    // overflow) contributes half a cell above and half a cell right, plus
    // GROUP_PAD.
    expect(retention).toEqual({ x: -38, y: -58, width: 336, height: 256 })
    expect(worldRectContainsPoint(retention, { x: 20, y: 20 })).toBe(true)
    expect(worldRectContainsPoint(retention, { x: 500, y: 20 })).toBe(false)
  })
})
