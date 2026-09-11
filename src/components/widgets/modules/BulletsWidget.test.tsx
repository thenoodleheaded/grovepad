import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { BulletsData } from '../../../types/spatial'
import { BulletsWidget } from './BulletsWidget'
import type { BulletSkin } from './bulletSkinModel'

describe('purpose-built Bullets skins', () => {
  const base: BulletsData = {
    items: [
      { id: 'one', text: 'First point' },
      { id: 'two', text: 'Second point' },
    ],
    skin: 'dots',
  }

  const render = (skin: BulletSkin, data: BulletsData = base) => renderToStaticMarkup(
    <BulletsWidget data={{ ...data, skin }} skin={skin} onChange={() => undefined} />,
  )

  it.each([
    ['dots', 'gp-bullets-dots'],
    ['numbered', 'gp-bullets-numbered'],
    ['nested_outline', 'gp-bullets-outline'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    const markup = render(skin)
    expect(markup).toContain(className)
    expect(markup).toContain(`data-bullets-skin="${skin}"`)
  })

  it('gives every point a wrapping field and no placeholder to read around', () => {
    for (const skin of ['dots', 'numbered', 'nested_outline'] as const) {
      const markup = render(skin)
      // A textarea is what lets one point run to a second line; an input could
      // only scroll its own tail out of sight.
      expect(markup).toContain('<textarea')
      expect(markup).not.toContain('placeholder')
    }
  })

  it('leaves the add control as a bare plus', () => {
    const markup = render('dots')
    expect(markup).toContain('aria-label="Add bullet"')
    expect(markup).not.toContain('Add bullet<')
  })

  it('numbers a sequence from one, with no leading zero', () => {
    const markup = render('numbered')
    expect(markup).toContain('>1</span>')
    expect(markup).not.toContain('>01</span>')
  })

  it('renders outline hierarchy from isolated skin state', () => {
    const outline = render('nested_outline', {
      ...base,
      skinStates: { nested_outline: { levels: { two: 1 }, collapsedIds: [] } },
    })
    expect(outline).toContain('--gp-bullet-level:1')
    expect(outline).toContain('aria-label="Collapse First point"')
  })
})
