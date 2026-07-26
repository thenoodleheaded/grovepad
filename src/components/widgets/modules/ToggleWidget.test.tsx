import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ToggleData } from '../../../types/spatial'
import { ToggleWidget } from './ToggleWidget'
import type { ToggleSkinMode } from './toggleSkinModel'

const SKINS = [
  'switch',
  'checkbox',
  'power',
  'segment',
  'availability',
  'tri_state',
] as const

function render(skin: ToggleSkinMode, data: Partial<ToggleData> = {}) {
  return renderToStaticMarkup(
    <ToggleWidget
      skin={skin}
      data={{ label: 'Venue confirmed', value: false, skin, ...data } as ToggleData}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Toggle skins', () => {
  it.each([
    ['switch', 'gp-toggle-track'],
    ['checkbox', 'gp-toggle-box'],
    ['power', 'gp-toggle-power-button'],
    ['segment', 'gp-toggle-segments'],
    ['availability', 'gp-toggle-presence'],
    ['tri_state', 'gp-toggle-segments--three'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    expect(render(skin)).toContain(className)
  })

  // A Toggle is a logic card before it is a control. Whatever a skin calls the
  // state, the boolean a wire would actually carry stays on screen.
  it.each(SKINS)('keeps the emitted boolean visible in the %s skin', (skin) => {
    expect(render(skin, { value: true }), `${skin} on`).toContain('<code>true</code>')
    // Tri-state's "unset" replaces the tag with the sentence that explains it.
    expect(render(skin, { value: false }), `${skin} off`).toContain('<code>false</code>')
  })

  it('says out loud that an unset tri-state still reads as false', () => {
    const markup = render('tri_state', { value: false, skinStates: { tri_state: { state: 'unset' } } })
    expect(markup).toContain('gp-toggle-note')
    expect(markup).toContain('<code>false</code>')
  })

  // Article XIX: a control that IS the content sits on the card's own
  // backplate, never inside a manufactured field island.
  it.each(SKINS)('keeps the %s text controls off a second glass island', (skin) => {
    const markup = render(skin, { skinStates: { segment: { onLabel: 'Production' } } })
    const chunks = markup.split('<input').slice(0, -1)
    expect(chunks.length).toBeGreaterThan(0)
    for (const chunk of chunks) {
      expect(chunk.slice(chunk.lastIndexOf('<div')), `${skin} input wrapper`)
        .toContain('gp-bare-field')
    }
  })

  it('exposes every control to assistive technology with its state', () => {
    expect(render('switch')).toContain('role="switch"')
    expect(render('checkbox')).toContain('role="checkbox"')
    expect(render('tri_state')).toContain('role="radiogroup"')
    for (const skin of SKINS) {
      expect(render(skin, { value: true }), skin).toMatch(/aria-(checked|pressed)="true"/)
    }
  })

  it('makes a tri-state one keyboard stop and announces every state change', () => {
    const markup = render('tri_state', {
      value: false,
      skinStates: { tri_state: { state: 'unset' } },
    })
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1)
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(2)
    expect(markup).toContain('aria-live="polite"')
  })

  it('uses the two named choices the segment skin was given', () => {
    const markup = render('segment', {
      value: true,
      skinStates: { segment: { onLabel: 'Production', offLabel: 'Staging' } },
    })
    expect(markup).toContain('Production')
    expect(markup).toContain('Staging')
  })
})
