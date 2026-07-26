import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TextInputData } from '../../../types/spatial'
import { TextInputWidget } from './TextInputWidget'
import type { TextInputSkinMode } from './textInputSkinModel'

const SKINS = [
  'single_line',
  'multiline',
  'search',
  'url',
  'email',
  'tags',
  'command',
] as const

function render(skin: TextInputSkinMode, data: Partial<TextInputData> = {}) {
  return renderToStaticMarkup(
    <TextInputWidget
      skin={skin}
      data={{
        label: 'Release name',
        value: '',
        placeholder: 'Type a value…',
        multiline: false,
        skin,
        ...data,
      } as TextInputData}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Text Input skins', () => {
  it.each([
    ['single_line', 'gp-input-line'],
    ['multiline', 'gp-input-page'],
    ['search', 'gp-input--search'],
    ['url', 'gp-input--url'],
    ['email', 'gp-input--email'],
    ['tags', 'gp-input-chips'],
    ['command', 'gp-input-prompt'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    expect(render(skin)).toContain(className)
  })

  // A Text Input is a wiring card before it is a form field: whatever shape
  // the skin gives it, the string a wire would carry stays on screen.
  it.each(SKINS)('keeps the emitted string visible in the %s skin', (skin) => {
    const markup = render(skin, {
      value: 'grovepad.app',
      skinStates: { command: { history: ['grovepad.app'] } },
    })
    expect(markup, skin).toContain('grovepad.app')
  })

  // The lamp is the one thing every skin says about its wiring: something is
  // being emitted, or nothing is.
  it.each(SKINS)('lights the %s skin’s lamp only once it holds a value', (skin) => {
    expect(render(skin), `${skin} empty`).toContain('title="Emitting nothing yet"')
    expect(render(skin, { value: 'alpha' }), `${skin} filled`)
      .toContain('title="Emitting a value"')
  })

  /**
   * A closing line only earns its row where it says something the field
   * cannot. Repeating the value under the box that already shows it is noise.
   */
  it.each(['multiline', 'tags', 'command'] as const)('closes the %s skin with a summary', (skin) => {
    expect(render(skin)).toContain('data-empty="true"')
  })

  it.each(['single_line', 'search', 'url', 'email'] as const)(
    'never repeats the value under the %s field',
    (skin) => {
      expect(render(skin, { value: 'alpha' })).not.toContain('gp-input-foot')
    },
  )

  // Article XIX: a control that IS the content sits on the card's own
  // backplate, never inside a manufactured field island.
  it.each(SKINS)('keeps the %s text controls off a second glass island', (skin) => {
    const markup = render(skin, { value: 'alpha, beta' })
    const chunks = markup.split(/<(?:input|textarea)/).slice(0, -1)
    expect(chunks.length).toBeGreaterThan(0)
    for (const chunk of chunks) {
      expect(chunk.slice(chunk.lastIndexOf('<div')), `${skin} control wrapper`)
        .toContain('gp-bare-field')
    }
  })

  it('names every control for assistive technology', () => {
    for (const skin of SKINS) {
      expect(render(skin), skin).toContain('aria-label="Input name"')
    }
    expect(render('search', { value: 'release notes' })).toContain('aria-label="Clear the query"')
    expect(render('tags', { value: 'alpha' })).toContain('aria-label="Remove alpha"')
    expect(render('command', { skinStates: { command: { draft: 'build' } } }))
      .toContain('aria-label="Run this command"')
  })
})

describe('address skins', () => {
  it('offers a real link only once the value is a web address', () => {
    const markup = render('url', { value: 'grovepad.app/boards' })
    expect(markup).toContain('href="https://grovepad.app/boards"')
    expect(markup).toContain('rel="noreferrer"')
  })

  /** A typed address is untrusted text; only http(s) may reach an href. */
  it('never renders a link for a scheme the browser should not follow', () => {
    const markup = render('url', { value: 'javascript:alert(1)' })
    expect(markup).not.toContain('href="javascript')
    expect(markup).toContain('Not a web address yet')
  })

  it('reports email shape without offering to send anything', () => {
    const valid = render('email', { value: 'ada@grovepad.app' })
    expect(valid).toContain('grovepad.app')
    expect(valid).not.toContain('mailto:')
    expect(render('email', { value: 'ada@' })).toContain('A name, an @, then a domain')
  })
})

describe('tags and command', () => {
  it('draws one chip per tag in the canonical string', () => {
    const markup = render('tags', { value: 'alpha, beta, alpha' })
    expect(markup.match(/<li/g)).toHaveLength(2)
  })

  it('lists the run history newest first and marks the emitted line', () => {
    const markup = render('command', {
      value: 'deploy',
      skinStates: { command: { history: ['deploy', 'build'] } },
    })
    expect(markup.indexOf('deploy')).toBeLessThan(markup.indexOf('build'))
    expect(markup).toContain('data-current="true"')
  })

  it('explains the submit contract while no command has been run', () => {
    expect(render('command')).toContain('gp-input-empty')
  })
})
