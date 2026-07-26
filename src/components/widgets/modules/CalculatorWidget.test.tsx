import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CalculatorData } from '../../../types/spatial'
import { CalculatorWidget } from './CalculatorWidget'
import type { CalculatorSkinMode } from './calculatorSkinModel'

const SKINS = [
  'basic',
  'scientific',
  'tape',
  'finance',
  'programmer',
  'date_math',
  'named_variables',
] as const

function render(skin: CalculatorSkinMode, data: Partial<CalculatorData> = {}) {
  return renderToStaticMarkup(
    <CalculatorWidget
      skin={skin}
      data={{ expression: '2+2', result: '4', skin, ...data } as CalculatorData}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Calculator skins', () => {
  it.each([
    ['basic', 'gp-calc-basic'],
    ['scientific', 'gp-calc-scientific'],
    ['tape', 'gp-calc-tape'],
    ['finance', 'gp-calc-finance'],
    ['programmer', 'gp-calc-programmer'],
    ['date_math', 'gp-calc-date'],
    ['named_variables', 'gp-calc-variables'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    expect(render(skin)).toContain(className)
  })

  it('falls back to the basic keypad for a skin it has never heard of', () => {
    expect(render('not_a_skin' as CalculatorSkinMode)).toContain('gp-calc-basic')
  })

  // Article XIX: a control that IS the content sits on the card's own
  // backplate, never inside a manufactured field island.
  it.each(SKINS)('keeps the %s text controls off a second glass island', (skin) => {
    const markup = render(skin, {
      skinStates: {
        tape: { draft: '2*3', draftResult: '6', entries: [{ id: 'a', expression: '1+1', result: '2' }] },
        finance: { mode: 'compound', a: '1000', b: '5', c: '10' },
        date_math: { mode: 'offset', from: '2026-07-27', days: '30' },
        named_variables: { variables: [{ id: 'v', name: 'rate', value: 12 }] },
      },
    })
    // Scan the whole prefix, not the gap since the previous input: two
    // sibling fields can share one wrapper (a variable's name and its value).
    let cursor = markup.indexOf('<input')
    expect(cursor, `${skin} renders no input at all`).toBeGreaterThan(-1)
    while (cursor !== -1) {
      const prefix = markup.slice(0, cursor)
      const open = Math.max(prefix.lastIndexOf('<div'), prefix.lastIndexOf('<label'))
      const openTag = prefix.slice(open, prefix.indexOf('>', open) + 1)
      expect(openTag, `${skin} input wrapper`).toContain('gp-bare-field')
      cursor = markup.indexOf('<input', cursor + 1)
    }
  })

  it('shows the answer every skin actually computed', () => {
    expect(render('basic')).toContain('4')
    expect(render('finance', { skinStates: { finance: { mode: 'percent_change', a: '120', b: '150' } } }))
      .toContain('25')
    expect(render('date_math', { skinStates: { date_math: { mode: 'between', from: '2026-03-01', to: '2026-03-31' } } }))
      .toContain('30')
    // One number, read four ways at once.
    const programmer = render('programmer', { expression: 'ff', result: '255', skinStates: { programmer: { base: 'hex' } } })
    expect(programmer).toContain('FF')
    expect(programmer).toContain('11111111')
    expect(programmer).toContain('377')
  })

  it('offers the keypad digits the active base allows, and no others', () => {
    const binary = render('programmer', { skinStates: { programmer: { base: 'bin' } } })
    expect(binary).toContain('aria-label="0"')
    expect(binary).toContain('aria-label="1"')
    expect(binary).not.toContain('aria-label="2"')

    const hex = render('programmer', { skinStates: { programmer: { base: 'hex' } } })
    expect(hex).toContain('aria-label="F"')
  })

  it('says where an unresolvable variable name is, before the sum fails', () => {
    const markup = render('named_variables', {
      expression: 'rate*2',
      skinStates: { named_variables: { variables: [{ id: 'v', name: '2bad', value: 1 }] } },
    })
    expect(markup).toContain('data-invalid="true"')
  })

  it('tells you a wire can drive the named values', () => {
    const markup = render('named_variables', {
      skinStates: { named_variables: { variables: [{ id: 'v', name: 'rate', value: 12 }] } },
    })
    expect(markup).toContain('A wire can write rate')
  })
})
