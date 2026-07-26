export type TableSkin =
  | 'grid'
  | 'compact_ledger'
  | 'cards'
  | 'database'
  | 'kanban'
  | 'gallery'
  | 'form_view'
  | 'pivot'

export type TableColumnType = 'text' | 'number' | 'status' | 'date' | 'url'
export type TableSortDirection = 'asc' | 'desc'
export type PivotAggregation = 'count' | 'sum' | 'average'

export interface DatabaseState {
  columnTypes: TableColumnType[]
  sortColumn: number
  sortDirection: TableSortDirection
  query: string
}

export interface KanbanState {
  groupBy: number
}

export interface GalleryState {
  coverColumn: number
  titleColumn: number
}

export interface FormState {
  selectedRecord: number
}

export interface PivotState {
  groupBy: number
  valueColumn: number
  aggregation: PivotAggregation
}

export interface IndexedTableRow {
  cells: string[]
  sourceIndex: number
}

export interface TableGroup {
  label: string
  rows: IndexedTableRow[]
}

export interface PivotResult {
  label: string
  count: number
  value: number
}

const TABLE_SKINS = new Set<TableSkin>([
  'grid',
  'compact_ledger',
  'cards',
  'database',
  'kanban',
  'gallery',
  'form_view',
  'pivot',
])

const COLUMN_TYPES = new Set<TableColumnType>(['text', 'number', 'status', 'date', 'url'])
const AGGREGATIONS = new Set<PivotAggregation>(['count', 'sum', 'average'])

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
}

function finiteInteger(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isInteger(raw) ? raw : fallback
}

export function tableSkin(raw: unknown): TableSkin {
  return typeof raw === 'string' && TABLE_SKINS.has(raw as TableSkin)
    ? raw as TableSkin
    : 'grid'
}

export function tableColumnCount(rows: readonly string[][]): number {
  return Math.max(1, ...rows.map((row) => row.length))
}

export function normalizedTableRows(rows: readonly string[][]): string[][] {
  const columnCount = tableColumnCount(rows)
  const source = rows.length > 0 ? rows : [[]]
  return source.map((row, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => {
      const value = row[columnIndex] ?? ''
      if (rowIndex === 0 && !value.trim()) return `Column ${columnIndex + 1}`
      return value
    }),
  )
}

export function tableHeaders(rows: readonly string[][]): string[] {
  return normalizedTableRows(rows)[0]!
}

export function tableRecords(rows: readonly string[][]): IndexedTableRow[] {
  return normalizedTableRows(rows).slice(1).map((cells, index) => ({
    cells,
    sourceIndex: index + 1,
  }))
}

export function numericCell(raw: string): number | null {
  const value = raw.trim()
  if (!value) return null
  const parsed = Number(value.replaceAll(',', ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function inferColumnType(rows: readonly string[][], columnIndex: number): TableColumnType {
  const values = tableRecords(rows)
    .map((row) => row.cells[columnIndex]?.trim() ?? '')
    .filter(Boolean)
  if (values.length === 0) return 'text'
  if (values.every((value) => numericCell(value) !== null)) return 'number'
  if (values.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) return 'date'
  if (values.every((value) => /^https?:\/\//i.test(value))) return 'url'
  const unique = new Set(values.map((value) => value.toLocaleLowerCase()))
  if (unique.size < values.length && unique.size <= Math.max(4, Math.ceil(values.length * 0.55))) {
    return 'status'
  }
  return 'text'
}

function columnIndex(raw: unknown, columnCount: number, fallback: number): number {
  return Math.max(0, Math.min(columnCount - 1, finiteInteger(raw, fallback)))
}

export function databaseState(
  raw: unknown,
  rows: readonly string[][],
): DatabaseState {
  const state = record(raw)
  const count = tableColumnCount(rows)
  const rawTypes = Array.isArray(state.columnTypes) ? state.columnTypes : []
  return {
    columnTypes: Array.from({ length: count }, (_, index) => {
      const value = rawTypes[index]
      return typeof value === 'string' && COLUMN_TYPES.has(value as TableColumnType)
        ? value as TableColumnType
        : inferColumnType(rows, index)
    }),
    sortColumn: columnIndex(state.sortColumn, count, 0),
    sortDirection: state.sortDirection === 'desc' ? 'desc' : 'asc',
    query: typeof state.query === 'string' ? state.query.slice(0, 160) : '',
  }
}

export function databaseRows(
  rows: readonly string[][],
  state: DatabaseState,
): IndexedTableRow[] {
  const query = state.query.trim().toLocaleLowerCase()
  const filtered = tableRecords(rows).filter((row) =>
    !query || row.cells.some((cell) => cell.toLocaleLowerCase().includes(query)),
  )
  const type = state.columnTypes[state.sortColumn] ?? 'text'
  const direction = state.sortDirection === 'desc' ? -1 : 1
  return filtered.toSorted((a, b) => {
    const left = a.cells[state.sortColumn] ?? ''
    const right = b.cells[state.sortColumn] ?? ''
    if (type === 'number') {
      return ((numericCell(left) ?? Number.NEGATIVE_INFINITY)
        - (numericCell(right) ?? Number.NEGATIVE_INFINITY)) * direction
    }
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }) * direction
  })
}

export function kanbanState(raw: unknown, rows: readonly string[][]): KanbanState {
  const state = record(raw)
  const count = tableColumnCount(rows)
  return { groupBy: columnIndex(state.groupBy, count, Math.max(0, count - 1)) }
}

export function kanbanGroups(
  rows: readonly string[][],
  state: KanbanState,
): TableGroup[] {
  const groups = new Map<string, IndexedTableRow[]>()
  for (const row of tableRecords(rows)) {
    const label = row.cells[state.groupBy]?.trim() || 'Unassigned'
    const group = groups.get(label) ?? []
    group.push(row)
    groups.set(label, group)
  }
  if (groups.size === 0) groups.set('Unassigned', [])
  return Array.from(groups, ([label, groupedRows]) => ({ label, rows: groupedRows }))
}

export function galleryState(raw: unknown, rows: readonly string[][]): GalleryState {
  const state = record(raw)
  const count = tableColumnCount(rows)
  const headers = tableHeaders(rows)
  const inferredCover = headers.findIndex((header) => /image|photo|cover|media|url/i.test(header))
  return {
    coverColumn: columnIndex(state.coverColumn, count, inferredCover >= 0 ? inferredCover : 0),
    titleColumn: columnIndex(state.titleColumn, count, 0),
  }
}

export function formState(raw: unknown, rows: readonly string[][]): FormState {
  const state = record(raw)
  const recordCount = tableRecords(rows).length
  return {
    selectedRecord: Math.max(
      0,
      Math.min(Math.max(0, recordCount - 1), finiteInteger(state.selectedRecord, 0)),
    ),
  }
}

export function pivotState(raw: unknown, rows: readonly string[][]): PivotState {
  const state = record(raw)
  const count = tableColumnCount(rows)
  return {
    groupBy: columnIndex(state.groupBy, count, 0),
    valueColumn: columnIndex(state.valueColumn, count, Math.min(1, count - 1)),
    aggregation:
      typeof state.aggregation === 'string'
      && AGGREGATIONS.has(state.aggregation as PivotAggregation)
        ? state.aggregation as PivotAggregation
        : 'count',
  }
}

export function pivotResults(
  rows: readonly string[][],
  state: PivotState,
): PivotResult[] {
  const groups = new Map<string, { count: number; values: number[] }>()
  for (const row of tableRecords(rows)) {
    const label = row.cells[state.groupBy]?.trim() || 'Unassigned'
    const group = groups.get(label) ?? { count: 0, values: [] }
    group.count += 1
    const value = numericCell(row.cells[state.valueColumn] ?? '')
    if (value !== null) group.values.push(value)
    groups.set(label, group)
  }
  return Array.from(groups, ([label, group]) => {
    const sum = group.values.reduce((total, value) => total + value, 0)
    return {
      label,
      count: group.count,
      value: state.aggregation === 'count'
        ? group.count
        : state.aggregation === 'average'
          ? group.values.length ? sum / group.values.length : 0
          : sum,
    }
  }).sort((a, b) => b.value - a.value)
}

export function looksLikeImageUrl(value: string): boolean {
  return /^https?:\/\/.+(?:\.(?:avif|gif|jpe?g|png|svg|webp)(?:\?.*)?|[?&](?:format|fm)=)/i.test(
    value.trim(),
  )
}
