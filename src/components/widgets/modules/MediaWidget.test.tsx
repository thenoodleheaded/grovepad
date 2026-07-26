import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MediaData } from '../../../types/spatial'
import { MediaWidget } from './MediaWidget'
import type { MediaSkinMode } from './mediaSkinModel'

const PICTURE = 'https://example.com/harbour.png'

function render(skin: MediaSkinMode, data: Partial<MediaData> = {}) {
  return renderToStaticMarkup(
    <MediaWidget
      skin={skin}
      data={{ url: PICTURE, caption: 'The harbour', skin, ...data } as MediaData}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Media skins', () => {
  it.each([
    ['image', 'gp-media-image'],
    ['video', 'gp-media-video'],
    ['audio', 'gp-media-audio'],
    ['document_preview', 'gp-media-document'],
    ['before_after', 'gp-media-compare'],
    ['gallery', 'gp-media-gallery'],
    ['moodboard', 'gp-media-moodboard'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    expect(render(skin)).toContain(className)
  })

  // Article XIX: a text control that IS the content sits on the card's own
  // backplate. Without `gp-bare-field` the auto field-island detector in
  // 06-field-islands.css wraps each one in a second pane of glass.
  it.each([
    'image',
    'video',
    'audio',
    'document_preview',
    'before_after',
    'gallery',
    'moodboard',
  ] as const)('keeps the %s text controls off a second glass island', (skin) => {
    const markup = render(skin, {
      skinStates: {
        gallery: { items: [{ id: 'a', url: PICTURE, caption: 'One' }], activeId: 'a' },
        moodboard: { items: [{ id: 'a', url: PICTURE, caption: 'One', x: 0.5, y: 0.5, scale: 0.3 }] },
        before_after: { beforeUrl: PICTURE, reveal: 40 },
      },
    })
    const chunks = markup.split('<input').slice(0, -1)
    expect(chunks.length).toBeGreaterThan(0)
    for (const chunk of chunks) {
      const open = Math.max(
        chunk.lastIndexOf('<div'),
        chunk.lastIndexOf('<figcaption'),
      )
      expect(chunk.slice(open), `${skin} input wrapper`).toContain('gp-bare-field')
    }
  })

  it('never lets a hostile address reach an image, a player, or a link', () => {
    const hostile = 'javascript:alert(1)'
    for (const skin of ['image', 'video', 'audio', 'document_preview', 'before_after'] as const) {
      const markup = render(skin, {
        url: hostile,
        skinStates: { before_after: { beforeUrl: hostile } },
      })
      for (const attribute of ['src', 'href', 'poster']) {
        expect(markup, `${skin} ${attribute}`).not.toContain(`${attribute}="javascript:`)
      }
    }
    // It still round-trips through its own editable field — refusing to render
    // the address is not the same as silently deleting what someone typed.
    expect(render('image', { url: hostile })).toContain('value="javascript:alert(1)"')
  })

  it('links out instead of pretending to embed a host-only player', () => {
    const markup = render('video', { url: 'https://www.youtube.com/watch?v=abc' })
    expect(markup).toContain('Watch on YouTube')
    expect(markup).not.toContain('<video')
  })

  it('offers the address field in place when the card is still empty', () => {
    // A blank media card whose only way forward is hidden behind a tool button
    // is a dead end.
    for (const skin of ['image', 'video', 'audio', 'document_preview', 'before_after'] as const) {
      expect(render(skin, { url: '', caption: '' }), skin).toMatch(/gp-media-(empty-action|prompt)/)
    }
  })
})
