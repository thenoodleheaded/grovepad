import {
  databaseRows,
  databaseState,
  formState,
  galleryState,
  kanbanGroups,
  kanbanState,
  numericCell,
  pivotResults,
  pivotState,
  tableHeaders,
  tableRecords,
  tableSkin,
  type IndexedTableRow,
} from '../../components/widgets/modules/tableSkinModel'
import {
  compact,
  formatRestNumber,
  REST_BAR_LIMIT,
  REST_CHIP_LIMIT,
  REST_COLUMN_ITEM_LIMIT,
  REST_LINE_LIMIT,
  REST_ROW_LIMIT,
  type RestCell,
  type RestingFaceModel,
} from '../restingFaceModel'

// ---------------------------------------------------------------------------
// Table resting faces.
//
// The eight Table skins are eight readings of one sheet, and each one folds to
// the reading it exists for: a grid folds to a grid, a pivot to its ranked
// report, a kanban to its columns. Everything comes from tableSkinModel, so
// the folded tile sorts, groups and aggregates exactly as the open card does.
// ---------------------------------------------------------------------------

const FACE_COLUMNS = 3
const FACE_ROWS = 4

function sheetRows(raw: unknown): string[][] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => (typeof cell === 'string' ? cell : '')))
}

function cellText(row: IndexedTableRow, index: number, fallback = '—'): string {
  return compact(row.cells[index]?.trim() || fallback, 18)
}

/** The last column that reads as numbers is the one a ledger sums, and the one
 * a folded row is most likely to want beside its name. */
function numericColumn(records: readonly IndexedTableRow[], columnCount: number): number {
  for (let index = columnCount - 1; index >= 0; index--) {
    const values = records.map((row) => row.cells[index]?.trim() ?? '').filter(Boolean)
    if (values.length > 0 && values.every((value) => numericCell(value) !== null)) return index
  }
  return -1
}

export function tableRestingFace(data: Record<string, unknown>): RestingFaceModel | null {
  const rows = sheetRows(data.rows)
  const records = tableRecords(rows)
  if (records.length === 0) return null
  const headers = tableHeaders(rows)
  const skin = tableSkin(data.skin)
  const states = (data.skinStates ?? {}) as Record<string, unknown>
  const columnCount = Math.min(FACE_COLUMNS, headers.length)

  if (skin === 'pivot') {
    const state = pivotState(states.pivot, rows)
    const results = pivotResults(rows, state).slice(0, REST_BAR_LIMIT)
    const peak = Math.max(1, ...results.map((result) => Math.abs(result.value)))
    return {
      kind: 'bars',
      eyebrow: {
        label: 'Pivot',
        note: compact(headers[state.groupBy] ?? '', 14),
      },
      bars: results.map((result, index) => ({
        key: `${result.label}-${index}`,
        label: compact(result.label, 20),
        value: formatRestNumber(Math.round(result.value * 10) / 10),
        fraction: Math.abs(result.value) / peak,
      })),
    }
  }

  if (skin === 'kanban') {
    const state = kanbanState(states.kanban, rows)
    const groups = kanbanGroups(rows, state).slice(0, 4)
    return {
      kind: 'columns',
      eyebrow: { label: 'Board', note: compact(headers[state.groupBy] ?? '', 14) },
      columns: groups.map((group, index) => {
        const visible = group.rows.slice(0, REST_COLUMN_ITEM_LIMIT)
        return {
          key: `${group.label}-${index}`,
          label: compact(group.label, 14),
          note: String(group.rows.length),
          items: visible.map((row) => ({
            key: `row-${row.sourceIndex}`,
            label: cellText(row, 0, 'Untitled'),
          })),
          overflow: Math.max(0, group.rows.length - visible.length),
        }
      }),
    }
  }

  if (skin === 'cards') {
    // Each record folds to the card it already is: its name over its first
    // couple of fields, standing beside the other records.
    const visible = records.slice(0, 3)
    return {
      kind: 'columns',
      eyebrow: { label: 'Records', note: String(records.length) },
      columns: visible.map((row) => ({
        key: `record-${row.sourceIndex}`,
        label: cellText(row, 0, 'Untitled record'),
        items: headers.slice(1, 1 + REST_COLUMN_ITEM_LIMIT).map((header, index) => ({
          key: `field-${index}`,
          label: compact(header, 12),
          value: cellText(row, index + 1),
        })),
        overflow: Math.max(0, headers.length - 1 - REST_COLUMN_ITEM_LIMIT),
      })),
    }
  }

  if (skin === 'gallery') {
    const state = galleryState(states.gallery, rows)
    const visible = records.slice(0, REST_CHIP_LIMIT)
    return {
      kind: 'chips',
      eyebrow: { label: 'Gallery', note: String(records.length) },
      chips: visible.map((row) => ({
        key: `tile-${row.sourceIndex}`,
        text: cellText(row, state.titleColumn, 'Untitled'),
        filled: true,
      })),
      overflow: Math.max(0, records.length - visible.length),
    }
  }

  if (skin === 'form_view') {
    const state = formState(states.form_view, rows)
    const selected = records[state.selectedRecord] ?? records[0]!
    const visible = headers.slice(0, REST_ROW_LIMIT)
    return {
      kind: 'rows',
      eyebrow: {
        label: 'Record',
        note: `${state.selectedRecord + 1}/${records.length}`,
      },
      rows: visible.map((header, index) => ({
        key: `field-${index}`,
        label: compact(header, 20),
        value: cellText(selected, index),
      })),
      overflow: Math.max(0, headers.length - visible.length),
    }
  }

  if (skin === 'compact_ledger') {
    // A ledger is its numbers and their sum: the row numbers and the Σ line
    // are the whole reason someone reaches for this skin.
    const column = numericColumn(records, headers.length)
    const visible = records.slice(0, REST_LINE_LIMIT)
    const total = column < 0
      ? null
      : records.reduce((sum, row) => sum + (numericCell(row.cells[column] ?? '') ?? 0), 0)
    return {
      kind: 'lines',
      mono: true,
      eyebrow: { label: 'Ledger', note: `${records.length} rows` },
      lines: visible.map((row, index) => ({
        key: `row-${row.sourceIndex}`,
        left: `${String(index + 1).padStart(2, '0')}  ${cellText(row, 0, 'Untitled')}`,
        ...(column < 0 ? {} : { right: cellText(row, column) }),
      })),
      ...(total === null ? {} : {
        total: { key: 'total', left: 'Σ', right: formatRestNumber(total), tone: 'accent' as const },
      }),
    }
  }

  const ordered = skin === 'database'
    ? databaseRows(rows, databaseState(states.database, rows))
    : records
  const state = skin === 'database' ? databaseState(states.database, rows) : null
  const visible = ordered.slice(0, FACE_ROWS)
  const cells: RestCell[] = []
  visible.forEach((row) => {
    for (let column = 0; column < columnCount; column++) {
      cells.push({
        key: `${row.sourceIndex}-${column}`,
        text: cellText(row, column, '—'),
        ...(column === 0 ? {} : { tone: 'muted' as const }),
      })
    }
  })

  return {
    kind: 'grid',
    cols: columnCount,
    header: headers.slice(0, columnCount).map((header) => compact(header, 14)),
    cells,
    eyebrow: state
      ? {
        label: 'Database',
        note: state.query
          ? `“${compact(state.query, 10)}”`
          : `${ordered.length} of ${records.length}`,
      }
      : { label: 'Table', note: `${records.length}×${headers.length}` },
  }
}
