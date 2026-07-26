import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TableData } from '../../../types/spatial'
import { TableWidget } from './TableWidget'
import type { TableSkin } from './tableSkinModel'

describe('purpose-built Table skins', () => {
  const base: TableData = {
    skin: 'grid',
    rows: [
      ['Project', 'Budget', 'Status'],
      ['Atlas', '1200', 'In progress'],
      ['Beacon', '850', 'Done'],
      ['Canvas', '2400', 'In progress'],
    ],
  }

  it.each([
    ['grid', 'gp-table-grid'],
    ['compact_ledger', 'gp-table-ledger'],
    ['cards', 'gp-table-cards'],
    ['database', 'gp-table-database'],
    ['kanban', 'gp-table-kanban'],
    ['gallery', 'gp-table-gallery'],
    ['form_view', 'gp-table-form'],
    ['pivot', 'gp-table-pivot'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    const markup = renderToStaticMarkup(
      <TableWidget
        data={{ ...base, skin: skin as TableSkin }}
        skin={skin}
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain(className)
    expect(markup).toContain(`data-table-skin="${skin}"`)
    expect(markup).toContain('aria-label="Edit table structure"')
    expect(markup).toContain('3 records')
  })

  it('renders advanced view settings from isolated skin state', () => {
    const kanban = renderToStaticMarkup(
      <TableWidget
        data={{ ...base, skin: 'kanban', skinStates: { kanban: { groupBy: 2 } } }}
        skin="kanban"
        onChange={() => undefined}
      />,
    )
    const form = renderToStaticMarkup(
      <TableWidget
        data={{ ...base, skin: 'form_view', skinStates: { form_view: { selectedRecord: 1 } } }}
        skin="form_view"
        onChange={() => undefined}
      />,
    )
    const pivot = renderToStaticMarkup(
      <TableWidget
        data={{
          ...base,
          skin: 'pivot',
          skinStates: {
            pivot: { groupBy: 2, valueColumn: 1, aggregation: 'sum' },
          },
        }}
        skin="pivot"
        onChange={() => undefined}
      />,
    )
    expect(kanban).toContain('In progress')
    expect(kanban).toContain('Move Atlas to group')
    expect(form).toContain('value="Beacon"')
    expect(pivot).toContain('3,600')
    expect(pivot).toContain('Sum of Budget')
  })
})
