import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CanvasEdge,
  CanvasEdgeLayer,
} from './CanvasEdge'

const RECT = { x: 0, y: 0, width: 100, height: 100 }

describe('CanvasEdgeLayer', () => {
  it('hides decorative routing from the accessibility tree when asked', () => {
    const hidden = renderToStaticMarkup(
      <CanvasEdgeLayer contentRect={RECT} ariaHidden>
        <path d="M 0 0 L 10 10" />
      </CanvasEdgeLayer>,
    )
    expect(hidden).toContain('aria-hidden="true"')
  })

  it('leaves interactive layers (wires) announceable by default', () => {
    const shown = renderToStaticMarkup(
      <CanvasEdgeLayer contentRect={RECT} dataCircuitLayer>
        <path d="M 0 0 L 10 10" />
      </CanvasEdgeLayer>,
    )
    expect(shown).not.toContain('aria-hidden')
  })
})

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
})
