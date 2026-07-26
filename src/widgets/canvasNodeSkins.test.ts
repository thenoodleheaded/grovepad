import { describe, expect, it } from 'vitest'
import { widgetDefinition } from './registry'

describe('Canvas widget skins', () => {
  it('offers all five Canvas experiences through the skin field', () => {
    const definition = widgetDefinition('canvas_node')
    expect(definition.skinField).toBe('skin')
    expect(definition.skins?.map((skin) => skin.value)).toEqual([
      'portal',
      'cover',
      'live_thumbnail',
      'dashboard_door',
      'folder_index',
    ])
  })

  it('keeps specialist schema-extension controls inside the renderer', () => {
    expect(widgetDefinition('canvas_node').rendererOwnedSkinDetails).toEqual([
      'live_thumbnail',
      'dashboard_door',
      'folder_index',
    ])
  })
})
