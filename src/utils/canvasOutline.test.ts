import { describe, expect, it } from 'vitest'
import type { CanvasMeta, Widget } from '../types/spatial'
import { buildCanvasOutline, nextCanvasOutlineKey } from './canvasOutline'

const canvases: Record<string, CanvasMeta> = {
  root: { id: 'root', workspaceId: 'ws', parentCanvasId: null, name: 'Origin' },
  child: { id: 'child', workspaceId: 'ws', parentCanvasId: 'root', name: 'Child' },
}

const widget = (id: string, canvasId: string, x: number, y: number, type: Widget['type'] = 'notes'): Widget => ({
  id,
  type,
  title: id,
  canvasId,
  position: { x, y },
  size: { width: 200, height: 120 },
  data: { text: '' },
  metadata: { badges: [], zIndex: 1 },
}) as Widget

describe('canvas accessibility outline', () => {
  it('orders cards spatially and canvases hierarchically without duplicating canvas nodes', () => {
    const entries = buildCanvasOutline(canvases, {
      right: widget('right', 'root', 500, 100),
      lower: widget('lower', 'root', 0, 400),
      left: widget('left', 'root', 100, 100),
      owner: widget('owner', 'root', 0, 0, 'canvas_node'),
      nested: widget('nested', 'child', 0, 0),
    }, 'ws', 'root')

    expect(entries.map((entry) => entry.key)).toEqual([
      'canvas:root',
      'widget:left',
      'widget:right',
      'widget:lower',
      'canvas:child',
      'widget:nested',
    ])
    expect(entries.at(-1)).toMatchObject({ level: 3, parentKey: 'canvas:child' })
  })

  it('supports linear, boundary, and parent-child keyboard navigation', () => {
    const entries = buildCanvasOutline(canvases, { one: widget('one', 'root', 0, 0) }, 'ws', 'root')
    expect(nextCanvasOutlineKey(entries, 'canvas:root', 'ArrowRight')).toBe('widget:one')
    expect(nextCanvasOutlineKey(entries, 'widget:one', 'ArrowLeft')).toBe('canvas:root')
    expect(nextCanvasOutlineKey(entries, 'canvas:root', 'ArrowUp')).toBe('canvas:root')
    expect(nextCanvasOutlineKey(entries, 'canvas:root', 'End')).toBe('canvas:child')
    expect(nextCanvasOutlineKey(entries, 'canvas:child', 'ArrowDown')).toBe('canvas:child')
  })
})
