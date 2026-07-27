import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Widget } from '../../types/spatial'
import { WidgetRestingFace } from './WidgetRestingFace'

function noteWidget(mode: string): Widget {
  return {
    id: `note-${mode}`,
    type: 'notes',
    title: 'Note',
    canvasId: 'canvas-1',
    position: { x: 0, y: 0 },
    size: { width: 320, height: 200 },
    data: {
      mode,
      text: '# A clear heading\n- First point\n- Second point',
      color: 'blue',
      attribution: 'Ada Lovelace',
      skinStates: {
        daily_log: { date: '2026-07-26' },
        callout: { tone: 'decision' },
        versioned_note: {
          snapshots: [
            { id: 'v1', label: 'Today, 10:00', text: 'Earlier draft', createdAt: '2026-07-26T10:00:00Z' },
            { id: 'v2', label: 'Yesterday', text: 'First draft', createdAt: '2026-07-25T10:00:00Z' },
          ],
        },
      },
    },
    metadata: { badges: [] },
  } as Widget
}

describe('Note resting faces', () => {
  it.each([
    'plain',
    'sticky',
    'quote',
    'daily_log',
    'markdown_page',
    'typewriter',
    'callout',
    'versioned_note',
  ] as const)('renders the %s skin as its own compact anatomy', (mode) => {
    const markup = renderToStaticMarkup(<WidgetRestingFace widget={noteWidget(mode)} />)

    expect(markup).toContain('data-rest-summary="note"')
    expect(markup).toContain(`data-rest-note-skin="${mode}"`)
    expect(markup).toContain('A clear heading')
    expect(markup).not.toContain('<textarea')
    expect(markup).not.toContain('<button')
  })

  it('carries the saved callout tone and version labels into the face', () => {
    const callout = renderToStaticMarkup(
      <WidgetRestingFace widget={noteWidget('callout')} />,
    )
    expect(callout).toContain('data-rest-callout-tone="decision"')
    expect(callout).toContain('Decision')

    const versioned = renderToStaticMarkup(
      <WidgetRestingFace widget={noteWidget('versioned_note')} />,
    )
    expect(versioned).toContain('Today, 10:00')
    expect(versioned).toContain('Yesterday')
  })
})
