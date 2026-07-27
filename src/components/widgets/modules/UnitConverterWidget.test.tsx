import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { UnitConverterData, UnitConverterSkin } from '../../../types/widgetDataExpansion'
import { UnitConverterWidget } from './UnitConverterWidget'

const SKINS = [
  'general',
  'cooking',
  'engineering',
  'data',
  'temperature',
  'currency',
  'custom_formula',
] as const

const anatomy: Readonly<Record<UnitConverterSkin, string>> = {
  general: 'gp-uc-detail--general',
  cooking: 'gp-uc-detail--cooking',
  engineering: 'gp-uc-detail--engineering',
  data: 'gp-uc-detail--data',
  temperature: 'gp-uc-detail--temperature',
  currency: 'gp-uc-detail--currency',
  custom_formula: 'gp-uc-detail--formula',
}

function render(skin: UnitConverterSkin, patch: Partial<UnitConverterData> = {}) {
  const data: UnitConverterData = {
    skin,
    category: 'length',
    value: 12,
    from: 'm',
    to: 'ft',
    precision: 2,
    ...patch,
  }
  return renderToStaticMarkup(<UnitConverterWidget data={data} onChange={() => undefined} />)
}

describe('purpose-built Unit Converter skins', () => {
  it.each(SKINS)('renders the %s skin with its own anatomy', (skin) => {
    const markup = render(skin)
    expect(markup).toContain(`data-uc-skin="${skin}"`)
    expect(markup).toContain(anatomy[skin])
  })

  it.each(SKINS)('keeps the shared conversion interaction visible in %s', (skin) => {
    const markup = render(skin)
    expect(markup).toContain('aria-label="Value to convert"')
    expect(markup).toContain('aria-label="Swap units"')
    expect(markup).toContain('aria-label="Copy converted output"')
    expect(markup).toContain('aria-label="Decimal precision"')
    expect(markup).toContain('gp-uc-side--output')
  })

  it('shows kitchen categories and recipe references on Cooking', () => {
    const markup = render('cooking')
    expect(markup).toContain('Volume')
    expect(markup).toContain('Weight')
    expect(markup).toContain('Temperature')
    expect(markup).toContain('Kitchen reference')
  })

  it('shows the complete technical category rail on Engineering', () => {
    const markup = render('engineering')
    for (const label of ['Length', 'Area', 'Volume', 'Pressure', 'Energy', 'Power']) {
      expect(markup).toContain(label)
    }
    expect(markup).toContain('REF')
  })

  it('makes decimal, binary, and bit scale legible on Data', () => {
    const markup = render('data')
    expect(markup).toContain('Decimal')
    expect(markup).toContain('Binary')
    expect(markup).toContain('make one byte')
  })

  it('owns the specialist Currency controls inside the renderer', () => {
    const markup = render('currency', {
      skinStates: {
        currency: {
          rate: 0.92,
          fromCode: 'USD',
          toCode: 'EUR',
          asOf: '2026-07-26',
        },
      },
    })
    expect(markup).toContain('aria-label="Exchange rate"')
    expect(markup).toContain('aria-label="Exchange rate date"')
    expect(markup).toContain('value="2026-07-26"')
  })

  it('prints the custom rule and exposes all four bounded inputs', () => {
    const markup = render('custom_formula', {
      value: 10,
      skinStates: {
        custom_formula: {
          factor: 1.8,
          offset: 32,
          fromLabel: '°C',
          toLabel: '°F',
        },
      },
    })
    expect(markup).toContain('aria-label="Conversion formula"')
    expect(markup).toContain('aria-label="Custom conversion factor"')
    expect(markup).toContain('aria-label="Custom conversion offset"')
    expect(markup).toContain('aria-label="Custom input unit name"')
    expect(markup).toContain('aria-label="Custom output unit name"')
    expect(markup).toContain('50')
  })
})
