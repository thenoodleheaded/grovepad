import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TextData } from '../../../types/spatial'
import { StickyNoteWidget } from './StickyNoteWidget'
import { TextRestPage } from './TextRestPage'
import { TextWidget } from './TextWidget'
import type { TextSkinMode } from './textSkinModel'

/**
 * The open tag of every element that has a `<textarea>` as a DIRECT child.
 *
 * Walked with a tag stack rather than by taking the nearest preceding `<div`:
 * the writing surface renders the markdown paint layer as a SIBLING of the
 * control, so "the last div before the textarea" is now a different element
 * from its parent — and the rule this guards (06-field-islands.css) matches on
 * `:has(> textarea)`, which is parentage, not proximity.
 */
function textareaParents(markup: string): string[] {
  const stack: string[] = []
  const parents: string[] = []
  const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
  for (const match of markup.matchAll(tag)) {
    const [whole, closing, name, , selfClosing] = match as unknown as string[]
    if (closing) {
      stack.pop()
      continue
    }
    if (name === 'textarea') {
      const parent = stack[stack.length - 1]
      if (parent) parents.push(parent)
      // A textarea in this markup is always written self-closed by React.
      if (!selfClosing) stack.push(whole as string)
      continue
    }
    if (!selfClosing && !VOID_TAGS.has(name as string)) stack.push(whole as string)
  }
  return parents
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'path', 'circle', 'line', 'rect', 'meta', 'link'])

describe('purpose-built Note skins', () => {
  const base: TextData = {
    text: '# A clear note\n\n- First\n- Second',
    mode: 'plain',
    color: 'yellow',
  }

  it.each([
    ['plain', 'gp-note-plain'],
    ['typewriter', 'gp-note-typewriter'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    const markup = renderToStaticMarkup(
      <TextWidget
        data={{ ...base, mode: skin as TextSkinMode }}
        skin={skin as TextSkinMode}
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain(className)
    expect(markup).toContain(`data-note-skin="${skin}"`)
  })

  // Article XIX: a widget whose whole body is one text control sits directly
  // on the card's backplate. Without `gp-bare-field` the auto field-island
  // detector in 06-field-islands.css wraps every skin in a second glass pane,
  // which is what clipped the Sticky corner.
  it.each(['plain', 'typewriter'] as const)(
    'keeps the %s text surface off a second glass island',
    (skin) => {
      const markup = renderToStaticMarkup(
        <TextWidget
          data={{ ...base, mode: skin as TextSkinMode }}
          skin={skin as TextSkinMode}
          onChange={() => undefined}
        />,
      )
      // Every element that directly wraps a <textarea> must opt out.
      for (const wrapper of textareaParents(markup)) {
        expect(wrapper, `${skin} textarea wrapper`).toContain('gp-bare-field')
      }
    },
  )

  it('keeps Sticky a polished first-class Note experience', () => {
    const sticky = renderToStaticMarkup(
      <StickyNoteWidget
        data={{ text: 'Remember this', color: 'yellow' }}
        onChange={() => undefined}
      />,
    )
    expect(sticky).toContain('gp-note-sticky')
    expect(sticky).toContain('aria-label="Sticky note color"')
  })

  it('gives Typewriter a focus toggle that reads its own state', () => {
    const markup = renderToStaticMarkup(
      <TextWidget
        data={{ ...base, mode: 'typewriter', skinStates: { typewriter: { focusMode: true } } }}
        skin="typewriter"
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain('data-focus-mode="true"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('Ease focus')
  })
  // --- The writing surface ------------------------------------------------

  /**
   * The formatting a writer sees. A textarea cannot style its own contents, so
   * the styling is painted behind it — and the paint has to reproduce every
   * character of the source, or it slides out from under the caret.
   */
  it.each(['plain', 'typewriter'] as const)('paints markdown behind the %s caret', (skin) => {
    const markup = renderToStaticMarkup(
      <TextWidget data={{ ...base, mode: skin }} skin={skin} onChange={() => undefined} />,
    )
    expect(markup).toContain('gp-md-paint')
    expect(markup).toContain('data-kind="heading"')
    expect(markup).toContain('data-kind="bullet"')
  })

  it('paints a sticky note with the same layer', () => {
    const markup = renderToStaticMarkup(
      <StickyNoteWidget data={{ text: '- [ ] milk', color: 'yellow' }} onChange={() => undefined} />,
    )
    expect(markup).toContain('data-kind="todo"')
    expect(markup).toContain('data-checked="false"')
  })

  /**
   * Plain's chrome floats over the writing and only appears once the card is in
   * use, which is what keeps a resting Text card nothing but its words.
   */
  it('gives Plain formatting on the card without adding a toolbar row', () => {
    const markup = renderToStaticMarkup(
      <TextWidget data={base} skin="plain" onChange={() => undefined} />,
    )
    expect(markup).toContain('gp-note-chrome')
    expect(markup).toContain('aria-label="Bold"')
  })

  /**
   * The one door into the writing view is the expand button on the card's own
   * name row — the same button every other widget uses to take the screen.
   * A second door inside the card was one too many, and it could never be
   * reached from a resting tile anyway, where the editor is not mounted.
   * No DOM in this runner, so the routing is read off the source.
   */
  it('opens the writing view from the card name row and nowhere else', () => {
    for (const skin of ['plain', 'typewriter'] as const) {
      const markup = renderToStaticMarkup(
        <TextWidget data={{ ...base, mode: skin }} skin={skin} onChange={() => undefined} />,
      )
      expect(markup, skin).not.toContain('Open writing view')
    }
    const card = readFileSync(new URL('../WidgetCard.tsx', import.meta.url), 'utf8')
    expect(card).toContain("openTextSheet(widgetId, widgetSheetOrigin(widgetId))")
    expect(card).toContain("widget.type === 'text' ? 'Open writing view' : 'Full screen'")
  })

  /** Typewriter is distraction-free by construction: the toolbar is absent. */
  it('gives Typewriter no formatting toolbar', () => {
    const markup = renderToStaticMarkup(
      <TextWidget data={{ ...base, mode: 'typewriter' }} skin="typewriter" onChange={() => undefined} />,
    )
    expect(markup).not.toContain('gp-note-chrome')
    expect(markup).not.toContain('role="toolbar"')
  })

  /** Sticky opens nothing: no sheet, no panels, no chrome over the pad. */
  it('leaves Sticky with only its pen and its colours', () => {
    const markup = renderToStaticMarkup(
      <StickyNoteWidget data={{ text: 'quick', color: 'yellow' }} onChange={() => undefined} />,
    )
    expect(markup).not.toContain('gp-note-chrome')
    expect(markup).not.toContain('Open writing view')
  })

  /**
   * A resting card is a photograph of the open one, so it shows the same
   * formatting — and it stays inert: the paint layer is a pure render with no
   * caret and no control of its own.
   */
  it.each(['plain', 'typewriter', 'sticky'] as const)('rests as the same page for %s', (skin) => {
    const markup = renderToStaticMarkup(
      <TextRestPage data={{ ...base, mode: skin }} skin={skin} />,
    )
    expect(markup).toContain('gp-md-paint')
    expect(markup).toContain('data-kind="heading"')
    expect(markup).not.toContain('<textarea')
    expect(markup).not.toContain('<button')
  })
})
