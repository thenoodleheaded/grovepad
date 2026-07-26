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

  it.each([
    ['dots', 'gp-bullets-dots'],
    ['numbered', 'gp-bullets-numbered'],
    ['compact_chips', 'gp-bullets-chips'],
    ['two_column', 'gp-bullets-columns'],
    ['nested_outline', 'gp-bullets-outline'],
    ['rolling_log', 'gp-bullets-log'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    const markup = renderToStaticMarkup(
      <BulletsWidget
        data={{ ...base, skin: skin as BulletSkin }}
        skin={skin as BulletSkin}
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain(className)
    expect(markup).toContain(`data-bullets-skin="${skin}"`)
  })

  it('renders outline hierarchy and log chronology from isolated skin state', () => {
    const outline = renderToStaticMarkup(
      <BulletsWidget
        data={{
          ...base,
          skin: 'nested_outline',
          skinStates: {
            nested_outline: { levels: { two: 1 }, collapsedIds: [] },
          },
        }}
        skin="nested_outline"
        onChange={() => undefined}
      />,
    )
    const log = renderToStaticMarkup(
      <BulletsWidget
        data={{
          ...base,
          skin: 'rolling_log',
          skinStates: {
            rolling_log: {
              order: 'newest',
              timestamps: { one: '2026-07-25T10:00:00.000Z' },
            },
          },
        }}
        skin="rolling_log"
        onChange={() => undefined}
      />,
    )
    expect(outline).toContain('--gp-bullet-level:1')
    expect(outline).toContain('aria-label="Collapse First point"')
    expect(log).toContain('Show oldest entries first')
    expect(log).toContain('dateTime="2026-07-25T10:00:00.000Z"')
  })
})
