import { describe, expect, it } from 'vitest'
import { isFixedSizeWidget } from './contracts/registry'
import { widgetDefinition } from './registry'

describe('Canvas widget skins', () => {
  it('always renders as its expanded card', () => {
    expect(widgetDefinition('canvas_node').restingFace).toBe(false)
  })

  it('offers all three Canvas experiences through the skin field', () => {
    const definition = widgetDefinition('canvas_node')
    expect(definition.skinField).toBe('skin')
    expect(definition.skins?.map((skin) => skin.value)).toEqual([
      'portal',
      'cover',
      'live_thumbnail',
    ])
  })

  it('keeps specialist schema-extension controls inside the renderer', () => {
    expect(widgetDefinition('canvas_node').rendererOwnedSkinDetails).toEqual([
      'live_thumbnail',
    ])
  })

  it('refuses to be resized as a Portal, and allows it for the picture skins', () => {
    const sizing = widgetDefinition('canvas_node').sizing
    // Portal is one line of text between two marks: dragging an edge could
    // only add empty glass or clip the name the card just sized itself to.
    expect(isFixedSizeWidget(sizing, { canvasId: 'c', skin: 'portal' })).toBe(true)
    expect(isFixedSizeWidget(sizing, { canvasId: 'c' })).toBe(true)
    expect(isFixedSizeWidget(sizing, { canvasId: 'c', skin: 'cover' })).toBe(false)
    expect(isFixedSizeWidget(sizing, { canvasId: 'c', skin: 'live_thumbnail' })).toBe(false)
  })

  it('drops the floating name row and fits its width to the canvas name', () => {
    const definition = widgetDefinition('canvas_node')
    // The card says the canvas's name itself, so the row above it could only
    // repeat it — and the skin trigger moves inside the card in its place.
    expect(definition.titleChrome).toBe(false)
    expect(definition.sizing?.autoWidth).toBe(true)
  })
})
