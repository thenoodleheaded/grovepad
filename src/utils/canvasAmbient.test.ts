import { describe, expect, it } from 'vitest'
import { canvasAmbientPalette } from './canvasAmbient'

const visibleRect = { x: 0, y: 0, width: 500, height: 400 }

function source(accent: string, x: number, y = 0) {
  return { accent, position: { x, y }, size: { width: 100, height: 100 } }
}

describe('canvasAmbientPalette', () => {
  it('uses only visible widgets and keeps repeated colors as one stronger bloom', () => {
    expect(canvasAmbientPalette([
      source('#ef4444', 10),
      source('#38bdf8', 130),
      source('#ef4444', 250),
      source('#a78bfa', 700),
    ], visibleRect, '#84cc16')).toEqual(['#ef4444', '#38bdf8'])
  })

  it('caps a colourful board at five deterministic blooms and falls back when empty', () => {
    expect(canvasAmbientPalette([
      source('#ef4444', 0),
      source('#f59e0b', 100),
      source('#84cc16', 200),
      source('#38bdf8', 300),
      source('#a78bfa', 400),
      source('#ec4899', 50, 150),
    ], visibleRect, '#14b8a6')).toEqual(['#ef4444', '#f59e0b', '#84cc16', '#38bdf8', '#a78bfa'])
    expect(canvasAmbientPalette([], visibleRect, '#14b8a6')).toEqual(['#14b8a6'])
  })
})
