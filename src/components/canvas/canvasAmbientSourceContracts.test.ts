/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const component = readFileSync(new URL('./CanvasAmbient.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../../styles/product.css', import.meta.url), 'utf8')

describe('canvas ambient performance contracts', () => {
  it('does not subscribe React rendering to the full widget collection', () => {
    expect(component).not.toContain('widgets: state.widgets')
    expect(component).toContain('PALETTE_SAMPLE_DELAY_MS = 240')
    expect(component).toContain('CAMERA_IDLE_DELAY_MS = 180')
    expect(component).not.toContain('useQuantizedView')
    expect(component).toContain("document.body.hasAttribute('data-widget-dragging')")
  })

  it('crossfades two painted layers without perpetual GPU animation', () => {
    expect(component).toContain('{[0, 1].map((index) => (')
    expect(styles).toContain('transition: opacity 1400ms linear')
    expect(styles).not.toContain('gp-canvas-ambient-drift')
    expect(styles).not.toContain('will-change: transform')
    expect(styles).not.toContain('will-change: opacity')
  })
})
