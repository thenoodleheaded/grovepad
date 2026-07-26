import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DrawingMode, SketchpadData } from '../../../types/spatial'
import { DrawingWidget } from './DrawingWidget'

vi.mock('./excalidraw/ExcalidrawWidget', () => ({
  ExcalidrawWidget: () => <div className="gp-excalidraw-launcher" />,
}))

const base: SketchpadData = {
  height: 240,
  mode: 'ink',
  strokes: [],
  diagram: { elements: [], appState: {}, files: [], updatedAt: '2026-07-25T00:00:00.000Z' },
}

describe('unified Drawing widget', () => {
  it.each([
    ['ink', 'data-drawing-surface="ink"'],
    ['whiteboard', 'data-drawing-surface="whiteboard"'],
    ['graph_paper', 'data-drawing-surface="graph_paper"'],
    ['dot_grid', 'data-drawing-surface="dot_grid"'],
    ['storyboard', 'gp-storyboard-strip'],
    ['annotation', 'gp-annotation-controls'],
    ['diagram', 'gp-excalidraw-launcher'],
  ] as const)('renders the %s mode as a purpose-built surface', (mode, marker) => {
    const markup = renderToStaticMarkup(
      <DrawingWidget
        data={{ ...base, mode: mode as DrawingMode }}
        widgetId="drawing-one"
        title="Concept"
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain(`data-drawing-mode="${mode}"`)
    expect(markup).toContain(marker)
  })

  it('renders persisted storyboard captions and annotation controls', () => {
    const storyboard = renderToStaticMarkup(
      <DrawingWidget
        data={{
          ...base,
          mode: 'storyboard',
          skinStates: {
            storyboard: {
              activeId: 'reveal',
              frames: [{ id: 'reveal', caption: 'The reveal', shot: 'Close-up', strokes: [] }],
            },
          },
        }}
        widgetId="drawing-two"
        title="Sequence"
        onChange={() => undefined}
      />,
    )
    expect(storyboard).toContain('The reveal')
    expect(storyboard).toContain('Close-up')
    expect(storyboard).toContain('aria-label="Frame caption"')

    const annotation = renderToStaticMarkup(
      <DrawingWidget
        data={{
          ...base,
          mode: 'annotation',
          skinStates: { annotation: { sourceUrl: 'https://example.com/ref.png', opacity: 0.5 } },
        }}
        widgetId="drawing-three"
        title="Markup"
        onChange={() => undefined}
      />,
    )
    expect(annotation).toContain('https://example.com/ref.png')
    expect(annotation).toContain('aria-label="Reference opacity"')
  })
})
