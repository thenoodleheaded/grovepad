import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FormulaData } from '../../../types/widgetDataWorkflow'
import { FormulaWidget } from './FormulaWidget'
import type { FormulaSkinMode } from './formulaSkinModel'

const SKINS = [
  'two_input',
  'percent_change',
  'ratio',
  'growth',
  'expression',
  'weighted_score',
  'conditional',
] as const

function render(skin: FormulaSkinMode, data: Partial<FormulaData> = {}) {
  return renderToStaticMarkup(
    <FormulaWidget
      skin={skin}
      data={{ label: 'Runway', a: 200, b: 250, operator: 'add', skin, ...data }}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Formula skins', () => {
  it.each([
    ['two_input', 'gp-fx-operators'],
    ['percent_change', 'gp-fx--percent'],
    ['ratio', 'gp-fx-split'],
    ['growth', 'gp-fx-periods'],
    ['expression', 'gp-fx-expression'],
    ['weighted_score', 'gp-fx-rows'],
    ['conditional', 'gp-fx-branches'],
  ] as const)('renders the %s question with its own anatomy', (skin, className) => {
    expect(render(skin)).toContain(className)
  })

  /**
   * A Formula is a logic card before it is a display. Whatever question a skin
   * asks, both operands stay on screen and editable — a wire writes A and B,
   * and a card that hid them could not be corrected by hand.
   */
  it.each(SKINS)('keeps both operands editable in the %s skin', (skin) => {
    const markup = render(skin)
    expect(markup).toContain('value="200"')
    expect(markup).toContain('value="250"')
  })

  it.each(SKINS)('shows the published answer in the %s skin', (skin) => {
    const markup = render(skin)
    expect(markup).toContain('gp-fx-hero')
    expect(markup).toContain('aria-label="Copy result"')
    expect(markup).toContain('role="status"')
  })

  it('names the movement and its direction on the percent card', () => {
    const up = render('percent_change')
    expect(up).toContain('25')
    expect(up).toContain('data-tone="up"')
    expect(up).toContain('Up 50 in absolute terms')

    expect(render('percent_change', { a: 250, b: 200 })).toContain('data-tone="down"')
  })

  it('draws the ratio to scale and prints the simplified pair', () => {
    const markup = render('ratio', { a: 3, b: 1 })
    expect(markup).toContain('Simplifies to 3 : 1')
    expect(markup).toContain('75 percent of the total')
    expect(markup).toContain('A · 75%')
    expect(markup).toContain('B · 25%')
  })

  it('projects six periods of growth without publishing more than one', () => {
    const markup = render('growth', { a: 1000, b: 10 })
    expect(markup).toContain('If the rate holds')
    expect((markup.match(/gp-fx-period-bar/g) ?? []).length).toBe(6)
    expect(markup).toContain('1100')
  })

  it('carries the written expression and reports one that cannot be read', () => {
    const good = render('expression', { skinStates: { expression: { expression: 'a * b' } } })
    expect(good).toContain('ƒ(a,b)')
    expect(good).toContain('value="a * b"')
    expect(good).toContain('50000')

    const bad = render('expression', { skinStates: { expression: { expression: 'a * * b' } } })
    expect(bad).toContain('data-invalid="true"')
    expect(bad).toContain('gp-fx-note')
  })

  /**
   * A and B are the two rows a circuit can actually write, so the weighted
   * card marks them and never offers to delete them.
   */
  it('marks the wired rows on the weighted card and can still add its own', () => {
    const markup = render('weighted_score', {
      skinStates: { weighted_score: { labelA: 'Cost', weightA: 2, rows: [{ id: 'r', label: 'Support', value: 10, weight: 1 }] } },
    })
    expect(markup).toContain('gp-fx-row-tag')
    expect(markup).toContain('value="Cost"')
    expect(markup).toContain('value="Support"')
    expect(markup).toContain('Add a row')
    expect(markup).toContain('Total weight')
    expect((markup.match(/gp-fx-row-remove/g) ?? []).length).toBe(1)
  })

  it('lights only the branch the comparison actually chose', () => {
    const markup = render('conditional', {
      a: 10,
      b: 4,
      skinStates: { conditional: { comparator: 'gt', whenTrue: 100, whenFalse: -1 } },
    })
    expect(markup).toContain('10 &gt; 4 is true')
    expect((markup.match(/data-live="true"/g) ?? []).length).toBe(1)
    expect((markup.match(/Selected/g) ?? []).length).toBe(1)
    expect((markup.match(/Standby/g) ?? []).length).toBe(1)
    expect(markup).toContain('100')
  })

  it('says plainly when the inputs cannot answer the question', () => {
    expect(render('two_input', { a: 7, b: 0, operator: 'divide' }))
      .toContain('B is zero, so this cannot be divided')
    expect(render('percent_change', { a: 0, b: 40 }))
      .toContain('A start of zero has no percent change')
  })
})
