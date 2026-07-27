import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { NotesData } from '../../../types/spatial'
import { QuoteWidget } from './QuoteWidget'
import { StickyNoteWidget } from './StickyNoteWidget'
import { NotesWidget } from './NotesWidget'
import type { NoteSkinMode } from './noteSkinModel'

describe('purpose-built Note skins', () => {
  const base: NotesData = {
    text: '# A clear note\n\n- First\n- Second',
    mode: 'plain',
    color: 'yellow',
    attribution: 'Grovepad',
  }

  it.each([
    ['plain', 'gp-note-plain'],
    ['daily_log', 'gp-note-daily'],
    ['markdown_page', 'gp-note-markdown'],
    ['typewriter', 'gp-note-typewriter'],
    ['callout', 'gp-note-callout'],
    ['versioned_note', 'gp-note-versioned'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    const markup = renderToStaticMarkup(
      <NotesWidget
        data={{ ...base, mode: skin as NoteSkinMode }}
        skin={skin as NoteSkinMode}
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain(className)
    expect(markup).toContain(`data-note-skin="${skin}"`)
  })

  // Article XIX: a widget whose whole body is one text control sits directly
  // on the card's backplate. Without `gp-bare-field` the auto field-island
  // detector in 06-field-islands.css wraps every skin in a second glass pane,
  // which is what clipped the Quote mark and the Sticky corner.
  it.each([
    'plain',
    'daily_log',
    'markdown_page',
    'typewriter',
    'callout',
    'versioned_note',
  ] as const)('keeps the %s text surface off a second glass island', (skin) => {
    const markup = renderToStaticMarkup(
      <NotesWidget
        data={{ ...base, mode: skin as NoteSkinMode }}
        skin={skin as NoteSkinMode}
        onChange={() => undefined}
      />,
    )
    // Every element that directly wraps a <textarea> must opt out.
    for (const wrapper of markup.split('<textarea').slice(0, -1)) {
      const openTag = wrapper.lastIndexOf('<div')
      expect(wrapper.slice(openTag), `${skin} textarea wrapper`).toContain('gp-bare-field')
    }
  })

  it('renders Markdown as safe React content instead of injecting HTML', () => {
    const markup = renderToStaticMarkup(
      <NotesWidget
        data={{
          ...base,
          mode: 'markdown_page',
          text: '# Heading\n\n<script>alert(1)</script>',
          skinStates: { markdown_page: { view: 'preview' } },
        }}
        skin="markdown_page"
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain('<h1>Heading</h1>')
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(markup).not.toContain('<script>')
  })

  it('keeps Sticky and Quote as polished first-class Note experiences', () => {
    const sticky = renderToStaticMarkup(
      <StickyNoteWidget
        data={{ text: 'Remember this', color: 'yellow' }}
        onChange={() => undefined}
      />,
    )
    const quote = renderToStaticMarkup(
      <QuoteWidget
        data={{ text: 'A line worth keeping', attribution: 'Ada' }}
        onChange={() => undefined}
      />,
    )
    expect(sticky).toContain('gp-note-sticky')
    expect(sticky).toContain('aria-label="Sticky note color"')
    expect(quote).toContain('gp-note-quote')
    expect(quote).toContain('aria-label="Attribution"')
  })

  it('makes Daily Log timestamps automatic instead of exposing a Time button', () => {
    const markup = renderToStaticMarkup(
      <NotesWidget
        data={{ ...base, mode: 'daily_log' }}
        skin="daily_log"
        onChange={() => undefined}
      />,
    )

    expect(markup).toContain('Enter adds time')
    expect(markup).not.toContain('>Time</button>')
  })

  it('renders saved versions as full list rows with useful previews', () => {
    const markup = renderToStaticMarkup(
      <NotesWidget
        data={{
          ...base,
          mode: 'versioned_note',
          skinStates: {
            versioned_note: {
              snapshots: [
                {
                  id: 'latest',
                  label: 'Jul 26, 6:22 PM',
                  text: 'The newest saved draft',
                  createdAt: '2026-07-26T13:22:00.000Z',
                },
                {
                  id: 'earlier',
                  label: 'Jul 26, 5:10 PM',
                  text: 'An earlier idea',
                  createdAt: '2026-07-26T12:10:00.000Z',
                },
              ],
            },
          },
        }}
        skin="versioned_note"
        onChange={() => undefined}
      />,
    )

    expect(markup.match(/gp-note-history-row/g)).toHaveLength(2)
    expect(markup).toContain('The newest saved draft')
    expect(markup).toContain('An earlier idea')
  })
})
