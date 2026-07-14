import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CanvasEdge,
} from './CanvasEdge'
import { edgeCorridorIntersectsRect, edgeDetailFor } from './canvasEdgePolicy'

describe('CanvasEdge', () => {
  it('uses one paint stack for every semantic variant', () => {
    const markup = renderToStaticMarkup(
      <CanvasEdge
        d="M 0 0 C 10 0 20 20 30 20"
        variant="dependency"
        connected
        track={{ stroke: '#f59e0b', width: 6 }}
        halo={{ stroke: '#f59e0b', width: 8 }}
        main={{ stroke: '#f59e0b', width: 2.2 }}
        flow={{ stroke: '#f59e0b', width: 2, dash: '2 6' }}
        hitArea={{ width: 16, cursor: 'context-menu' }}
      />,
    )

    expect(markup).toContain('data-edge-variant="dependency"')
    expect(markup).toContain('data-connected="true"')
    expect(markup).toContain('gp-canvas-edge-track')
    expect(markup).toContain('gp-canvas-edge-halo')
    expect(markup).toContain('gp-canvas-edge-main')
    expect(markup).toContain('gp-canvas-edge-flow')
    expect(markup).toContain('gp-canvas-edge-hit')
  })

  it('keeps minimal detail to the main stroke only', () => {
    const markup = renderToStaticMarkup(
      <CanvasEdge
        d="M 0 0 L 20 20"
        variant="relation"
        detail="minimal"
        highlight={{ stroke: '#34d399', width: 6 }}
        track={{ stroke: '#fff', width: 6 }}
        halo={{ stroke: '#fff', width: 7 }}
        main={{ stroke: '#fff', width: 2 }}
        flow={{ stroke: '#fff', width: 2 }}
        hitArea={{ width: 14, cursor: 'pointer' }}
      />,
    )

    expect(markup).toContain('gp-canvas-edge-main')
    expect(markup).not.toContain('gp-canvas-edge-highlight')
    expect(markup).not.toContain('gp-canvas-edge-track')
    expect(markup).not.toContain('gp-canvas-edge-halo')
    expect(markup).not.toContain('gp-canvas-edge-flow')
    expect(markup).not.toContain('gp-canvas-edge-hit')
  })
})

describe('shared edge policies', () => {
  it('quantizes detail consistently', () => {
    expect(edgeDetailFor(1, 10)).toBe('rich')
    expect(edgeDetailFor(0.5, 10)).toBe('standard')
    expect(edgeDetailFor(1, 500)).toBe('standard')
    expect(edgeDetailFor(0.2, 10)).toBe('minimal')
    expect(edgeDetailFor(1, 800)).toBe('minimal')
  })

  it('keeps crossing edges when both endpoints are offscreen', () => {
    const viewport = { x: 0, y: 0, width: 200, height: 120 }
    expect(edgeCorridorIntersectsRect(
      { x: -100, y: 60 },
      { x: 300, y: 60 },
      viewport,
      0,
    )).toBe(true)
    expect(edgeCorridorIntersectsRect(
      { x: -100, y: -200 },
      { x: -20, y: -120 },
      viewport,
      10,
    )).toBe(false)
  })
})
