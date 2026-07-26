import { describe, expect, it } from 'vitest'
import {
  databaseRows,
  databaseState,
  formState,
  galleryState,
  kanbanGroups,
  kanbanState,
  normalizedTableRows,
  pivotResults,
  pivotState,
  tableSkin,
} from './tableSkinModel'

const rows = [
  ['Project', 'Budget', 'Status', 'Launch'],
  ['Atlas', '1200', 'In progress', '2026-08-01'],
  ['Beacon', '850', 'Done', '2026-07-15'],
  ['Canvas', '2400', 'In progress', '2026-09-10'],
]

describe('table skin model', () => {
  it('normalizes ragged legacy rows and falls back to Grid safely', () => {
    expect(normalizedTableRows([['Name', ''], ['Atlas']])).toEqual([
      ['Name', 'Column 2'],
      ['Atlas', ''],
    ])
    expect(tableSkin('unknown')).toBe('grid')
  })

  it('infers column types and filters numeric-sorted database rows', () => {
    const state = databaseState(
      { sortColumn: 1, sortDirection: 'desc', query: 'a' },
      rows,
    )
    expect(state.columnTypes).toEqual(['text', 'number', 'status', 'date'])
    expect(databaseRows(rows, state).map((row) => row.cells[0])).toEqual([
      'Canvas',
      'Atlas',
      'Beacon',
    ])
  })

  it('groups Kanban records by a bounded selected field', () => {
    const state = kanbanState({ groupBy: 2 }, rows)
    expect(kanbanGroups(rows, state).map((group) => [
      group.label,
      group.rows.length,
    ])).toEqual([
      ['In progress', 2],
      ['Done', 1],
    ])
  })

  it('sanitizes gallery and form selections against the current table', () => {
    expect(galleryState({ coverColumn: 99, titleColumn: -5 }, rows)).toEqual({
      coverColumn: 3,
      titleColumn: 0,
    })
    expect(formState({ selectedRecord: 99 }, rows)).toEqual({ selectedRecord: 2 })
  })

  it('builds count, sum, and average pivot reports', () => {
    const sum = pivotResults(rows, pivotState({
      groupBy: 2,
      valueColumn: 1,
      aggregation: 'sum',
    }, rows))
    const average = pivotResults(rows, pivotState({
      groupBy: 2,
      valueColumn: 1,
      aggregation: 'average',
    }, rows))
    expect(sum).toEqual([
      { label: 'In progress', count: 2, value: 3600 },
      { label: 'Done', count: 1, value: 850 },
    ])
    expect(average[0]).toEqual({ label: 'In progress', count: 2, value: 1800 })
  })
})
