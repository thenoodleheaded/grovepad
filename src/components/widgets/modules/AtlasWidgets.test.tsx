import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AtlasWidgetData } from '../../../types/spatial'
import { defaultAtlasData } from '../../../widgets/atlasCatalog'
import { atlasSkinsFor, type AtlasSkin } from '../../../widgets/atlasSkins'
import { AtlasWidget } from './AtlasWidgets'

const draw = (type: 'fuel_log' | 'price_book' | 'prayer_times', skin: AtlasSkin, data?: Partial<AtlasWidgetData>) =>
  renderToStaticMarkup(
    <AtlasWidget
      type={type}
      skin={skin}
      data={{ ...defaultAtlasData(type), ...data }}
      onChange={() => undefined}
    />,
  )

describe('Atlas skins draw their own body', () => {
  it.each([
    ['object', 'gauge'],
    ['dial', 'dial'],
    ['trend', 'trend'],
  ] as const)('renders the %s shape with its own anatomy', (skin, visual) => {
    expect(draw('fuel_log', skin)).toContain(`data-visual="${visual}"`)
  })

  it('lists the card’s items as rows in the Ledger shape', () => {
    const markup = draw('price_book', 'ledger')
    expect(markup).toContain('data-visual="ledger"')
    expect(markup).toContain('First item')
    expect(markup).toContain('Next item')
  })

  it('says so plainly rather than drawing an empty ledger', () => {
    expect(draw('price_book', 'ledger', { items: [] })).toContain('No entries yet')
  })

  it('lays the stored times across the day in the Schedule shape', () => {
    const markup = draw('prayer_times', 'schedule')
    expect(markup).toContain('data-visual="schedule"')
    expect(markup).toContain('05:10')
    expect(markup).toContain('19:42')
  })

  it('waits for a real history before drawing a Trend line', () => {
    expect(draw('fuel_log', 'trend', { history: [{ t: 1, v: 3 }] })).toContain('Not enough readings yet')
  })

  it('reduces the Compact shape to one reading and one action', () => {
    const markup = draw('fuel_log', 'compact')
    expect(markup).not.toContain('gp-atlas-object')
    expect(markup.match(/<button/g) ?? []).toHaveLength(1)
  })

  /** A skin is a way of seeing, so the card's controls survive every shape
   *  except the deliberately reduced Compact line. */
  it('keeps the card’s own actions reachable in every full shape', () => {
    for (const skin of atlasSkinsFor('fuel_log')) {
      if (skin.value === 'compact') continue
      expect(draw('fuel_log', skin.value as AtlasSkin), skin.value).toContain('log fillup')
    }
  })
})
