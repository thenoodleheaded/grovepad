import { describe, expect, it } from 'vitest'
import type { Widget } from '../types/spatial'
import {
  lightweightWidgetPreviewImage,
  widgetPreviewCacheSize,
} from './widgetPreviewImage'

function widget(title: string): Widget {
  return {
    id: title,
    type: 'notes',
    title,
    canvasId: 'canvas',
    position: { x: 0, y: 0 },
    size: { width: 240, height: 160 },
    data: { text: `Preview for ${title}` },
    metadata: { badges: [] },
  }
}

describe('lightweight widget preview images', () => {
  it('returns one stable, compact image URL for identical content', () => {
    const first = lightweightWidgetPreviewImage(widget('Alpha'), { width: 240, height: 160 })
    const second = lightweightWidgetPreviewImage(widget('Alpha'), { width: 240, height: 160 })
    expect(first).toBe(second)
    expect(first.startsWith('data:image/svg+xml,')).toBe(true)
    expect(first.length).toBeLessThan(2_500)
  })

  it('changes the cached image when readable widget identity changes', () => {
    const first = lightweightWidgetPreviewImage(widget('Alpha'), { width: 240, height: 160 })
    const second = lightweightWidgetPreviewImage(widget('Beta'), { width: 240, height: 160 })
    expect(first).not.toBe(second)
  })

  it('keeps the in-memory image catalogue bounded', () => {
    for (let index = 0; index < 540; index += 1) {
      lightweightWidgetPreviewImage(widget(`Widget ${index}`), { width: 240, height: 160 })
    }
    expect(widgetPreviewCacheSize()).toBeLessThanOrEqual(512)
  })
})
