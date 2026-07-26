import { describe, expect, it } from 'vitest'
import type { CanvasMeta, Widget } from '../../../types/spatial'
import {
  canvasCoverState,
  canvasNodeSkin,
  canvasPreviewItems,
  summarizeCanvasNode,
} from './canvasNodeSkinModel'

function widget(
  id: string,
  type: Widget['type'],
  options: {
    completed?: boolean
    favorite?: boolean
    critical?: boolean
    x?: number
    y?: number
  } = {},
): Widget {
  return {
    id,
    type,
    title: id,
    canvasId: 'target',
    position: { x: options.x ?? 0, y: options.y ?? 0 },
    size: { width: 120, height: 80 },
    data: {},
    metadata: {
      badges: options.critical
        ? [{ type: 'priority_flag', level: 'critical' }]
        : [],
      completed: options.completed,
      favorite: options.favorite,
    },
  } as Widget
}

describe('Canvas-node skin model', () => {
  it('sanitizes persisted skin and Cover settings', () => {
    expect(canvasNodeSkin('dashboard_door')).toBe('dashboard_door')
    expect(canvasNodeSkin('unknown')).toBe('portal')
    expect(canvasCoverState({ eyebrow: 'Project', subtitle: 'A calm place' })).toEqual({
      eyebrow: 'Project',
      subtitle: 'A calm place',
    })
    expect(canvasCoverState(null)).toEqual({ eyebrow: 'Open canvas', subtitle: '' })
  })

  it('summarizes completion, attention, favorites, types, and nested canvases', () => {
    const canvases: Record<string, CanvasMeta> = {
      target: { id: 'target', name: 'Target', workspaceId: 'ws', parentCanvasId: null },
      beta: { id: 'beta', name: 'Beta', workspaceId: 'ws', parentCanvasId: 'target' },
      alpha: { id: 'alpha', name: 'Alpha', workspaceId: 'ws', parentCanvasId: 'target' },
    }
    const widgets = {
      one: widget('one', 'notes', { completed: true, favorite: true }),
      two: widget('two', 'notes', { critical: true }),
      three: widget('three', 'checklist'),
    }

    expect(summarizeCanvasNode('target', canvases, widgets)).toEqual({
      widgetCount: 3,
      completedCount: 1,
      completionPercent: 33,
      attentionCount: 1,
      favoriteCount: 1,
      childCanvases: [canvases.alpha, canvases.beta],
      typeCounts: [
        { type: 'notes', count: 2 },
        { type: 'checklist', count: 1 },
      ],
    })
  })

  it('normalizes a child canvas arrangement into bounded preview geometry', () => {
    const items = canvasPreviewItems('target', {
      one: widget('one', 'notes', { x: -400, y: 120 }),
      two: widget('two', 'checklist', { x: 520, y: 840, completed: true }),
    })

    expect(items).toHaveLength(2)
    expect(items.every((item) =>
      item.x >= 0 &&
      item.y >= 0 &&
      item.x + item.width <= 101 &&
      item.y + item.height <= 95,
    )).toBe(true)
    expect(items[1]?.completed).toBe(true)
  })
})
