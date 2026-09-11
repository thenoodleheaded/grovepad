import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Widget } from '../../types/spatial'
import { WidgetRestingFace } from './WidgetRestingFace'

// Static server render reads a zustand store's INITIAL state, so the canvas
// door tests hand the hook a fixed board instead of seeding the live store.
vi.mock('../../store/useWidgetStore', () => {
  const farWidget = (id: string, completed: boolean) => ({
    id,
    type: 'text',
    title: 'Card',
    canvasId: 'far-canvas',
    position: { x: 0, y: 0 },
    size: { width: 160, height: 120 },
    data: { text: '', mode: 'plain' },
    metadata: { badges: [], completed },
  })
  const state = {
    canvases: {
      'far-canvas': { id: 'far-canvas', name: 'Research den', workspaceId: 'ws-1', parentCanvasId: 'canvas-1' },
      'child-a': { id: 'child-a', name: 'Sources', workspaceId: 'ws-1', parentCanvasId: 'far-canvas' },
    },
    widgets: { 'far-1': farWidget('far-1', true), 'far-2': farWidget('far-2', false) },
    canvasViews: {},
  }
  return { useWidgetStore: (selector: (value: typeof state) => unknown) => selector(state) }
})

function noteWidget(mode: string): Widget {
  return {
    id: `note-${mode}`,
    type: 'text',
    title: 'Text',
    canvasId: 'canvas-1',
    position: { x: 0, y: 0 },
    size: { width: 320, height: 200 },
    data: {
      mode,
      text: '# A clear heading\n- First point\n- Second point',
      color: 'blue',
    },
    metadata: { badges: [] },
  } as Widget
}

describe('Note resting faces', () => {
  it.each([
    'plain',
    'sticky',
    'typewriter',
  ] as const)('renders the %s skin as its own compact anatomy', (mode) => {
    const markup = renderToStaticMarkup(<WidgetRestingFace widget={noteWidget(mode)} />)

    expect(markup).toContain('data-rest-summary="note"')
    expect(markup).toContain(`data-rest-note-skin="${mode}"`)
    expect(markup).toContain('A clear heading')
    expect(markup).not.toContain('<textarea')
    expect(markup).not.toContain('<button')
  })

  it('keeps the sticky tint and its ink on the resting page', () => {
    const markup = renderToStaticMarkup(
      <WidgetRestingFace widget={noteWidget('sticky')} />,
    )
    expect(markup).toContain('data-note-color="blue"')
    expect(markup).toContain('gp-note-sticky-sheet')
  })
})

function doorWidget(skin: string, skinStates?: Record<string, unknown>): Widget {
  return {
    id: `door-${skin}`,
    type: 'canvas_node',
    title: 'Research den',
    canvasId: 'canvas-1',
    position: { x: 0, y: 0 },
    size: { width: 280, height: 80 },
    data: { canvasId: 'far-canvas', skin, ...(skinStates ? { skinStates } : {}) },
    metadata: { badges: [] },
  } as unknown as Widget
}

describe('Canvas door resting faces', () => {
  it('rests the portal as its door strip, saying the live name and nothing else', () => {
    const markup = renderToStaticMarkup(<WidgetRestingFace widget={doorWidget('portal')} />)
    expect(markup).toContain('data-rest-summary="canvas"')
    expect(markup).toContain('Research den')
    // A door does not narrate going through itself, or tally what is behind it.
    expect(markup).not.toContain('Step inside')
    expect(markup).not.toContain('2 cards')
    expect(markup).not.toContain('<button')
  })

  it('rests the live thumbnail as a miniature of the far canvas', () => {
    const markup = renderToStaticMarkup(<WidgetRestingFace widget={doorWidget('live_thumbnail')} />)
    // Two far cards fold to two positioned rectangles inside the miniature.
    expect(markup.match(/left:/g)?.length).toBe(2)
    expect(markup).toContain('Research den')
  })

  it('rests the cover with its own pocket over the live name', () => {
    const markup = renderToStaticMarkup(
      <WidgetRestingFace
        widget={doorWidget('cover', { cover: { eyebrow: 'Chapter one', subtitle: 'Where the plan lives' } })}
      />,
    )
    // The subtitle is the cover's one pocket of its own words; the retired
    // eyebrow is not carried forward.
    expect(markup).not.toContain('Chapter one')
    expect(markup).toContain('Where the plan lives')
    expect(markup).toContain('Research den')
  })
})
