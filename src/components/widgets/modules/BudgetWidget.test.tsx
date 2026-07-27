import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { BudgetData } from '../../../types/spatial'
import { BudgetWidget } from './BudgetWidget'
import type { BudgetSkinMode } from './budgetSkinModel'

describe('purpose-built Budget skins', () => {
  const base: BudgetData = {
    currency: '$',
    items: [
      { id: 'hosting', label: 'Hosting', amount: 120 },
      { id: 'design', label: 'Design', amount: 80 },
    ],
  }

  it.each([
    ['category_plan', 'gp-budget-plan'],
    ['envelope', 'gp-budget-envelope-grid'],
    ['zero_based', 'gp-budget-zero'],
    ['50_30_20', 'gp-budget-rule'],
    ['cashflow', 'gp-budget-cashflow'],
    ['sinking_funds', 'gp-budget-funds'],
    ['shared_budget', 'gp-budget-shared'],
    ['project_budget', 'gp-budget-project'],
  ] as const)('renders the %s skin with its own anatomy', (skin, className) => {
    const markup = renderToStaticMarkup(
      <BudgetWidget
        data={{ ...base, skin: skin as BudgetSkinMode }}
        skin={skin}
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain(className)
    expect(markup).toContain(`data-budget-skin="${skin}"`)
    expect(markup).toContain('aria-label="Edit budget lines"')
    expect(markup).toContain('$200.00')
  })

  it('renders each specialist skin from its isolated saved details', () => {
    const markup = renderToStaticMarkup(
      <BudgetWidget
        data={{
          ...base,
          skin: 'project_budget',
          skinStates: {
            project_budget: {
              project: 'Studio launch',
              statuses: { hosting: 'paid', design: 'invoiced' },
            },
          },
        }}
        skin="project_budget"
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain('value="Studio launch"')
    expect(markup).toContain('data-status="paid"')
    expect(markup).toContain('$120.00')
  })
})
