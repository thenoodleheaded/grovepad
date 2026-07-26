import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Columns3,
  Database,
  Grid2X2,
  Images,
  PanelsTopLeft,
  ListChecks,
  Minus,
  Plus,
  Search,
  Settings2,
  Table2,
  X,
} from 'lucide-react'
import type { TableData } from '../../../types/spatial'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import { summarizeNumericColumn } from '../../../utils/widgetValueValidation'
import {
  databaseRows,
  databaseState,
  formState,
  galleryState,
  kanbanGroups,
  kanbanState,
  looksLikeImageUrl,
  normalizedTableRows,
  numericCell,
  pivotResults,
  pivotState,
  tableColumnCount,
  tableHeaders,
  tableRecords,
  tableSkin,
  type DatabaseState,
  type GalleryState,
  type PivotAggregation,
  type TableColumnType,
  type TableSkin,
} from './tableSkinModel'

interface TableWidgetProps {
  data: TableData
  skin?: TableSkin
  onChange: (data: TableData) => void
}

interface CellPosition {
  row: number
  col: number
}

const SKIN_META = {
  grid: { label: 'Grid', icon: Grid2X2 },
  compact_ledger: { label: 'Compact ledger', icon: Table2 },
  cards: { label: 'Record cards', icon: PanelsTopLeft },
  database: { label: 'Database', icon: Database },
  kanban: { label: 'Kanban', icon: Columns3 },
  gallery: { label: 'Gallery', icon: Images },
  form_view: { label: 'Form view', icon: ListChecks },
  pivot: { label: 'Pivot report', icon: BarChart3 },
} as const

const COLUMN_TYPE_LABELS: Record<TableColumnType, string> = {
  text: 'Text',
  number: 'Number',
  status: 'Status',
  date: 'Date',
  url: 'URL',
}

function statusTone(value: string): string {
  const normalized = value.trim().toLocaleLowerCase()
  if (/done|complete|approved|paid|shipped|live|yes/.test(normalized)) return 'positive'
  if (/block|cancel|reject|late|error|no/.test(normalized)) return 'negative'
  if (/progress|review|pending|hold|wait|draft/.test(normalized)) return 'pending'
  return 'neutral'
}

function initials(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? '')
    .join('') || '—'
}

export function TableWidget({ data, skin: rawSkin, onChange }: TableWidgetProps) {
  const skin = tableSkin(rawSkin ?? data.skin)
  const rows = useMemo(() => normalizedTableRows(data.rows), [data.rows])
  const headers = rows[0]!
  const records = useMemo(() => tableRecords(rows), [rows])
  const columnCount = tableColumnCount(rows)
  const cellRefs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocusKey = useRef<string | null>(null)
  const [selected, setSelected] = useState<CellPosition>({ row: 0, col: 0 })
  const [studioOpen, setStudioOpen] = useState(false)

  useEffect(() => {
    if (!pendingFocusKey.current) return
    cellRefs.current.get(pendingFocusKey.current)?.focus()
    pendingFocusKey.current = null
  })

  useEffect(() => {
    setSelected((current) => ({
      row: Math.min(current.row, Math.max(0, rows.length - 1)),
      col: Math.min(current.col, Math.max(0, columnCount - 1)),
    }))
  }, [columnCount, rows.length])

  const commitRows = (nextRows: string[][]) =>
    onChange({ ...data, rows: nextRows })

  const setCell = (rowIndex: number, colIndex: number, value: string) => {
    const nextRows = rows.map((row) => [...row])
    nextRows[rowIndex]![colIndex] = value
    commitRows(nextRows)
  }

  const addRow = (seed?: string[]) => {
    const row = Array.from({ length: columnCount }, (_, index) => seed?.[index] ?? '')
    commitRows([...rows, row])
  }

  const removeRow = (rowIndex: number) => {
    if (rowIndex === 0) return
    commitRows(rows.filter((_, index) => index !== rowIndex))
  }

  const addColumn = () => commitRows(rows.map((row) => [...row, '']))

  const removeColumn = (columnIndex = columnCount - 1) => {
    if (columnCount < 2) return
    commitRows(rows.map((row) => row.filter((_, index) => index !== columnIndex)))
  }

  const updateSkinState = (value: TableSkin, state: object) =>
    onChange(dataWithSkinState(data, value, state as Record<string, unknown>) as TableData)

  const moveRecordToGroup = (sourceIndex: number, columnIndex: number, value: string) =>
    setCell(sourceIndex, columnIndex, value)

  const onCellKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number,
  ) => {
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Enter: [1, 0],
    }
    const delta = deltas[event.key]
    if (!delta) return
    event.preventDefault()
    if (event.key === 'Enter' && rowIndex === rows.length - 1) {
      pendingFocusKey.current = `${rowIndex + 1}:${colIndex}`
      addRow()
      return
    }
    const row = Math.max(0, Math.min(rows.length - 1, rowIndex + delta[0]))
    const col = Math.max(0, Math.min(columnCount - 1, colIndex + delta[1]))
    setSelected({ row, col })
    cellRefs.current.get(`${row}:${col}`)?.focus()
  }

  const renderCellInput = (
    rowIndex: number,
    colIndex: number,
    options?: { compact?: boolean; type?: TableColumnType },
  ) => {
    const isHeader = rowIndex === 0
    const value = rows[rowIndex]?.[colIndex] ?? ''
    const inputType = options?.type === 'number'
      ? 'text'
      : options?.type === 'date'
        ? 'date'
        : options?.type === 'url'
          ? 'url'
          : 'text'
    return (
      <input
        data-floor-label
        ref={(element) => {
          const key = `${rowIndex}:${colIndex}`
          if (element) cellRefs.current.set(key, element)
          else cellRefs.current.delete(key)
        }}
        type={inputType}
        inputMode={options?.type === 'number' ? 'decimal' : undefined}
        value={value}
        aria-label={`Cell ${rowIndex + 1}, ${colIndex + 1}`}
        placeholder={isHeader ? `Column ${colIndex + 1}` : 'Empty'}
        onChange={(event) => setCell(rowIndex, colIndex, event.target.value)}
        onFocus={() => setSelected({ row: rowIndex, col: colIndex })}
        onKeyDown={(event) => onCellKeyDown(event, rowIndex, colIndex)}
        className="gp-table-cell-input"
        data-header={isHeader || undefined}
        data-compact={options?.compact || undefined}
      />
    )
  }

  const MetaIcon = SKIN_META[skin].icon
  const selectedSummary = summarizeNumericColumn(rows, selected.col)

  return (
    <div
      data-floor-panel="rows"
      data-floor-overflow="scroll"
      data-table-skin={skin}
      className="gp-table-skin"
    >
      <header className="gp-table-heading">
        <span className="gp-table-kicker" aria-hidden="true"><MetaIcon size={13} /></span>
        <span className="gp-table-title-stack">
          <strong>{SKIN_META[skin].label}</strong>
          <small>{records.length} {records.length === 1 ? 'record' : 'records'} · {columnCount} {columnCount === 1 ? 'field' : 'fields'}</small>
        </span>
        <span className="gp-table-selection" title={selectedSummary ?? undefined}>
          {selectedSummary ?? `R${selected.row + 1} · C${selected.col + 1}`}
        </span>
        <button
          type="button"
          className="gp-table-studio-trigger"
          aria-label="Edit table structure"
          aria-expanded={studioOpen}
          onClick={() => setStudioOpen((open) => !open)}
        >
          <Settings2 size={13} />
        </button>
      </header>

      <main className="gp-table-workspace">
        {skin === 'grid' && (
          <GridView
            rows={rows}
            selected={selected}
            renderCellInput={renderCellInput}
            removeRow={removeRow}
          />
        )}
        {skin === 'compact_ledger' && (
          <LedgerView
            rows={rows}
            selected={selected}
            renderCellInput={renderCellInput}
            removeRow={removeRow}
          />
        )}
        {skin === 'cards' && (
          <CardsView
            headers={headers}
            records={records}
            setCell={setCell}
            removeRow={removeRow}
            addRow={addRow}
          />
        )}
        {skin === 'database' && (
          <DatabaseView
            rows={rows}
            selected={selected}
            renderCellInput={renderCellInput}
            removeRow={removeRow}
            state={databaseState(skinStateFor(data, 'database'), rows)}
            updateState={(state) => updateSkinState('database', state)}
          />
        )}
        {skin === 'kanban' && (
          <KanbanView
            rows={rows}
            state={kanbanState(skinStateFor(data, 'kanban'), rows)}
            updateState={(state) => updateSkinState('kanban', state)}
            moveRecord={moveRecordToGroup}
            setCell={setCell}
            removeRow={removeRow}
            addRow={addRow}
          />
        )}
        {skin === 'gallery' && (
          <GalleryView
            rows={rows}
            state={galleryState(skinStateFor(data, 'gallery'), rows)}
            updateState={(state) => updateSkinState('gallery', state)}
            setCell={setCell}
            removeRow={removeRow}
            addRow={addRow}
          />
        )}
        {skin === 'form_view' && (
          <FormView
            rows={rows}
            selectedRecord={formState(skinStateFor(data, 'form_view'), rows).selectedRecord}
            setSelectedRecord={(selectedRecord) =>
              updateSkinState('form_view', { selectedRecord })}
            setCell={setCell}
            addRow={addRow}
            removeRow={removeRow}
          />
        )}
        {skin === 'pivot' && (
          <PivotView
            rows={rows}
            state={pivotState(skinStateFor(data, 'pivot'), rows)}
            updateState={(state) => updateSkinState('pivot', state)}
          />
        )}
      </main>

      <footer className="gp-table-footer">
        <button type="button" onClick={() => addRow()}><Plus size={10} /> Record</button>
        <button type="button" onClick={addColumn}><Plus size={10} /> Field</button>
        {columnCount > 1 && (
          <button type="button" data-danger onClick={() => removeColumn()}>
            <Minus size={10} /> Last field
          </button>
        )}
        <span>{rows.length} × {columnCount}</span>
      </footer>

      {studioOpen && (
        <TableStudio
          rows={rows}
          renderCellInput={renderCellInput}
          addRow={addRow}
          addColumn={addColumn}
          removeRow={removeRow}
          removeColumn={removeColumn}
          onClose={() => setStudioOpen(false)}
        />
      )}
    </div>
  )
}

interface GridViewProps {
  rows: string[][]
  selected: CellPosition
  renderCellInput: (
    rowIndex: number,
    colIndex: number,
    options?: { compact?: boolean; type?: TableColumnType },
  ) => React.ReactNode
  removeRow: (rowIndex: number) => void
}

function GridView({ rows, selected, renderCellInput, removeRow }: GridViewProps) {
  return (
    <div className="gp-table-grid gp-table-scroll">
      <table>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} data-header={rowIndex === 0 || undefined}>
              <th scope="row">{rowIndex === 0 ? '#' : rowIndex}</th>
              {row.map((_, colIndex) => (
                <td
                  key={colIndex}
                  data-selected={selected.row === rowIndex && selected.col === colIndex || undefined}
                >
                  {renderCellInput(rowIndex, colIndex)}
                </td>
              ))}
              <td className="gp-table-row-action">
                {rowIndex > 0 && rows.length > 2 && (
                  <button
                    type="button"
                    aria-label={`Remove row ${rowIndex + 1}`}
                    onClick={() => removeRow(rowIndex)}
                  >
                    <X size={10} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LedgerView({ rows, selected, renderCellInput, removeRow }: GridViewProps) {
  const totals = rows[0]!.map((_, columnIndex) => {
    const values = rows.slice(1)
      .map((row) => numericCell(row[columnIndex] ?? ''))
      .filter((value): value is number => value !== null)
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null
  })
  return (
    <div className="gp-table-ledger gp-table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            {rows[0]!.map((_, columnIndex) => (
              <th key={columnIndex}>{renderCellInput(0, columnIndex, { compact: true })}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, index) => {
            const rowIndex = index + 1
            return (
              <tr key={rowIndex}>
                <th>{String(rowIndex).padStart(2, '0')}</th>
                {row.map((cell, columnIndex) => (
                  <td
                    key={columnIndex}
                    data-numeric={numericCell(cell) !== null || undefined}
                    data-selected={selected.row === rowIndex && selected.col === columnIndex || undefined}
                  >
                    {renderCellInput(rowIndex, columnIndex, { compact: true })}
                  </td>
                ))}
                <td className="gp-table-row-action">
                  {rows.length > 2 && (
                    <button
                      type="button"
                      aria-label={`Remove row ${rowIndex + 1}`}
                      onClick={() => removeRow(rowIndex)}
                    >
                      <X size={9} />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <th>Σ</th>
            {totals.map((total, columnIndex) => (
              <td key={columnIndex}>{total === null ? '—' : total.toLocaleString()}</td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

interface RecordViewProps {
  headers: string[]
  records: ReturnType<typeof tableRecords>
  setCell: (row: number, col: number, value: string) => void
  removeRow: (row: number) => void
  addRow: (seed?: string[]) => void
}

function CardsView({ headers, records, setCell, removeRow, addRow }: RecordViewProps) {
  return (
    <div className="gp-table-cards gp-table-scroll">
      {records.map((record, index) => (
        <article key={record.sourceIndex} className="gp-table-record-card">
          <header>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{record.cells[0]?.trim() || 'Untitled record'}</strong>
            <button
              type="button"
              aria-label={`Remove record ${index + 1}`}
              onClick={() => removeRow(record.sourceIndex)}
            >
              <X size={10} />
            </button>
          </header>
          <div>
            {headers.map((header, columnIndex) => (
              <label key={columnIndex}>
                <span>{header}</span>
                <input
                  value={record.cells[columnIndex] ?? ''}
                  aria-label={`${header}, record ${index + 1}`}
                  placeholder="—"
                  onChange={(event) =>
                    setCell(record.sourceIndex, columnIndex, event.target.value)}
                />
              </label>
            ))}
          </div>
        </article>
      ))}
      <button type="button" className="gp-table-add-card" onClick={() => addRow()}>
        <Plus size={14} /><span>New record</span>
      </button>
    </div>
  )
}

interface DatabaseViewProps extends GridViewProps {
  state: DatabaseState
  updateState: (state: DatabaseState) => void
}

function DatabaseView({
  rows,
  selected,
  renderCellInput,
  removeRow,
  state,
  updateState,
}: DatabaseViewProps) {
  const visibleRows = databaseRows(rows, state)
  const headers = tableHeaders(rows)
  const setColumnType = (columnIndex: number, type: TableColumnType) => {
    const columnTypes = [...state.columnTypes]
    columnTypes[columnIndex] = type
    updateState({ ...state, columnTypes })
  }
  const changeSort = (columnIndex: number) =>
    updateState({
      ...state,
      sortColumn: columnIndex,
      sortDirection:
        state.sortColumn === columnIndex && state.sortDirection === 'asc' ? 'desc' : 'asc',
    })

  return (
    <div className="gp-table-database">
      <div className="gp-table-db-toolbar">
        <label>
          <Search size={11} />
          <input
            value={state.query}
            aria-label="Search database"
            placeholder="Find any record…"
            onChange={(event) => updateState({ ...state, query: event.target.value })}
          />
          {state.query && (
            <button
              type="button"
              aria-label="Clear database search"
              onClick={() => updateState({ ...state, query: '' })}
            >
              <X size={9} />
            </button>
          )}
        </label>
        <span>{visibleRows.length} shown</span>
      </div>
      <div className="gp-table-db-grid gp-table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              {headers.map((header, columnIndex) => (
                <th key={columnIndex}>
                  <button type="button" onClick={() => changeSort(columnIndex)}>
                    <strong>{header}</strong>
                    {state.sortColumn === columnIndex
                      ? state.sortDirection === 'asc' ? <ArrowUp size={9} /> : <ArrowDown size={9} />
                      : null}
                  </button>
                  <select
                    aria-label={`Type for ${header}`}
                    value={state.columnTypes[columnIndex]}
                    onChange={(event) =>
                      setColumnType(columnIndex, event.target.value as TableColumnType)}
                  >
                    {Object.entries(COLUMN_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((record) => (
              <tr key={record.sourceIndex}>
                <th>{record.sourceIndex}</th>
                {record.cells.map((cell, columnIndex) => {
                  const type = state.columnTypes[columnIndex] ?? 'text'
                  return (
                    <td
                      key={columnIndex}
                      data-selected={
                        selected.row === record.sourceIndex && selected.col === columnIndex || undefined
                      }
                      data-type={type}
                    >
                      {type === 'status' && cell.trim() && (
                        <i aria-hidden="true" data-tone={statusTone(cell)} />
                      )}
                      {renderCellInput(record.sourceIndex, columnIndex, { compact: true, type })}
                    </td>
                  )
                })}
                <td className="gp-table-row-action">
                  <button
                    type="button"
                    aria-label={`Remove row ${record.sourceIndex + 1}`}
                    onClick={() => removeRow(record.sourceIndex)}
                  >
                    <X size={9} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleRows.length === 0 && (
          <div className="gp-table-empty"><Search size={18} /><strong>No matching records</strong><span>Try a broader search.</span></div>
        )}
      </div>
    </div>
  )
}

interface KanbanViewProps {
  rows: string[][]
  state: ReturnType<typeof kanbanState>
  updateState: (state: ReturnType<typeof kanbanState>) => void
  moveRecord: (row: number, col: number, value: string) => void
  setCell: (row: number, col: number, value: string) => void
  removeRow: (row: number) => void
  addRow: (seed?: string[]) => void
}

function KanbanView({
  rows,
  state,
  updateState,
  moveRecord,
  setCell,
  removeRow,
  addRow,
}: KanbanViewProps) {
  const headers = tableHeaders(rows)
  const groups = kanbanGroups(rows, state)
  const groupNames = groups.map((group) => group.label)
  return (
    <div className="gp-table-kanban">
      <div className="gp-table-view-config">
        <span>Group by</span>
        <select
          aria-label="Kanban group field"
          value={state.groupBy}
          onChange={(event) => updateState({ groupBy: Number(event.target.value) })}
        >
          {headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
        </select>
        <small>Move cards with their status menu</small>
      </div>
      <div className="gp-table-kanban-board gp-table-scroll">
        {groups.map((group) => (
          <section key={group.label}>
            <header>
              <i data-tone={statusTone(group.label)} />
              <strong>{group.label}</strong>
              <span>{group.rows.length}</span>
            </header>
            <div>
              {group.rows.map((record) => (
                <article key={record.sourceIndex}>
                  <button
                    type="button"
                    aria-label={`Remove ${record.cells[0] || 'record'}`}
                    onClick={() => removeRow(record.sourceIndex)}
                  >
                    <X size={9} />
                  </button>
                  <input
                    value={record.cells[0] ?? ''}
                    aria-label={`${headers[0]}, record ${record.sourceIndex}`}
                    placeholder="Untitled"
                    onChange={(event) => setCell(record.sourceIndex, 0, event.target.value)}
                  />
                  {record.cells.map((cell, columnIndex) =>
                    columnIndex !== 0 && columnIndex !== state.groupBy && cell.trim() ? (
                      <p key={columnIndex}><span>{headers[columnIndex]}</span>{cell}</p>
                    ) : null,
                  )}
                  <select
                    aria-label={`Move ${record.cells[0] || 'record'} to group`}
                    value={record.cells[state.groupBy] || 'Unassigned'}
                    onChange={(event) =>
                      moveRecord(record.sourceIndex, state.groupBy, event.target.value)}
                  >
                    {groupNames.map((name) => <option key={name}>{name}</option>)}
                  </select>
                </article>
              ))}
              <button
                type="button"
                className="gp-table-kanban-add"
                onClick={() => {
                  const seed = Array.from({ length: headers.length }, () => '')
                  seed[state.groupBy] = group.label === 'Unassigned' ? '' : group.label
                  addRow(seed)
                }}
              >
                <Plus size={10} /> Add card
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

interface GalleryViewProps {
  rows: string[][]
  state: GalleryState
  updateState: (state: GalleryState) => void
  setCell: (row: number, col: number, value: string) => void
  removeRow: (row: number) => void
  addRow: (seed?: string[]) => void
}

function GalleryView({
  rows,
  state,
  updateState,
  setCell,
  removeRow,
  addRow,
}: GalleryViewProps) {
  const headers = tableHeaders(rows)
  const records = tableRecords(rows)
  return (
    <div className="gp-table-gallery">
      <div className="gp-table-view-config">
        <span>Cover</span>
        <select
          aria-label="Gallery cover field"
          value={state.coverColumn}
          onChange={(event) =>
            updateState({ ...state, coverColumn: Number(event.target.value) })}
        >
          {headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
        </select>
        <span>Title</span>
        <select
          aria-label="Gallery title field"
          value={state.titleColumn}
          onChange={(event) =>
            updateState({ ...state, titleColumn: Number(event.target.value) })}
        >
          {headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
        </select>
      </div>
      <div className="gp-table-gallery-grid gp-table-scroll">
        {records.map((record, index) => {
          const cover = record.cells[state.coverColumn] ?? ''
          const title = record.cells[state.titleColumn]?.trim() || `Record ${index + 1}`
          return (
            <article key={record.sourceIndex}>
              <div
                className="gp-table-gallery-cover"
                style={looksLikeImageUrl(cover) ? { backgroundImage: `url("${cover}")` } : undefined}
                data-has-image={looksLikeImageUrl(cover) || undefined}
              >
                {!looksLikeImageUrl(cover) && <strong>{initials(title)}</strong>}
                <span>{String(index + 1).padStart(2, '0')}</span>
                <button
                  type="button"
                  aria-label={`Remove ${title}`}
                  onClick={() => removeRow(record.sourceIndex)}
                >
                  <X size={10} />
                </button>
              </div>
              <div>
                <input
                  value={record.cells[state.titleColumn] ?? ''}
                  aria-label={`${headers[state.titleColumn]}, record ${index + 1}`}
                  placeholder="Untitled record"
                  onChange={(event) =>
                    setCell(record.sourceIndex, state.titleColumn, event.target.value)}
                />
                {record.cells.map((cell, columnIndex) =>
                  columnIndex !== state.titleColumn && columnIndex !== state.coverColumn && cell.trim() ? (
                    <p key={columnIndex}><span>{headers[columnIndex]}</span>{cell}</p>
                  ) : null,
                )}
              </div>
            </article>
          )
        })}
        <button type="button" className="gp-table-gallery-add" onClick={() => addRow()}>
          <Plus size={16} /><span>Add record</span>
        </button>
      </div>
    </div>
  )
}

interface FormViewProps {
  rows: string[][]
  selectedRecord: number
  setSelectedRecord: (index: number) => void
  setCell: (row: number, col: number, value: string) => void
  addRow: (seed?: string[]) => void
  removeRow: (row: number) => void
}

function FormView({
  rows,
  selectedRecord,
  setSelectedRecord,
  setCell,
  addRow,
  removeRow,
}: FormViewProps) {
  const headers = tableHeaders(rows)
  const records = tableRecords(rows)
  const current = records[selectedRecord]
  const move = (delta: number) =>
    setSelectedRecord(Math.max(0, Math.min(records.length - 1, selectedRecord + delta)))
  return (
    <div className="gp-table-form">
      <div className="gp-table-form-nav">
        <button type="button" aria-label="Previous record" disabled={selectedRecord === 0} onClick={() => move(-1)}>
          <ArrowLeft size={11} />
        </button>
        <span><strong>{records.length ? selectedRecord + 1 : 0}</strong> / {records.length}</span>
        <button
          type="button"
          aria-label="Next record"
          disabled={selectedRecord >= records.length - 1}
          onClick={() => move(1)}
        >
          <ArrowRight size={11} />
        </button>
        <select
          aria-label="Selected form record"
          value={records.length ? selectedRecord : ''}
          disabled={!records.length}
          onChange={(event) => setSelectedRecord(Number(event.target.value))}
        >
          {records.map((record, index) => (
            <option key={record.sourceIndex} value={index}>
              {record.cells[0]?.trim() || `Record ${index + 1}`}
            </option>
          ))}
        </select>
        {current && (
          <button
            type="button"
            data-danger
            aria-label="Delete current record"
            onClick={() => removeRow(current.sourceIndex)}
          >
            <X size={10} /> Delete
          </button>
        )}
      </div>
      {current ? (
        <div className="gp-table-form-fields gp-table-scroll">
          {headers.map((header, columnIndex) => (
            <label key={columnIndex}>
              <span>{header}<small>{String(columnIndex + 1).padStart(2, '0')}</small></span>
              <input
                value={current.cells[columnIndex] ?? ''}
                aria-label={`${header}, form field`}
                placeholder={`Enter ${header.toLocaleLowerCase()}`}
                onChange={(event) =>
                  setCell(current.sourceIndex, columnIndex, event.target.value)}
              />
            </label>
          ))}
        </div>
      ) : (
        <div className="gp-table-empty">
          <ListChecks size={19} />
          <strong>No records yet</strong>
          <button type="button" onClick={() => addRow()}><Plus size={10} /> Create first record</button>
        </div>
      )}
    </div>
  )
}

interface PivotViewProps {
  rows: string[][]
  state: ReturnType<typeof pivotState>
  updateState: (state: ReturnType<typeof pivotState>) => void
}

function PivotView({ rows, state, updateState }: PivotViewProps) {
  const headers = tableHeaders(rows)
  const results = pivotResults(rows, state)
  const max = Math.max(1, ...results.map((result) => Math.abs(result.value)))
  const aggregationLabels: Record<PivotAggregation, string> = {
    count: 'Count',
    sum: 'Sum',
    average: 'Average',
  }
  return (
    <div className="gp-table-pivot">
      <div className="gp-table-pivot-config">
        <label><span>Rows</span>
          <select
            aria-label="Pivot row field"
            value={state.groupBy}
            onChange={(event) => updateState({ ...state, groupBy: Number(event.target.value) })}
          >
            {headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
          </select>
        </label>
        <label><span>Values</span>
          <select
            aria-label="Pivot value field"
            value={state.valueColumn}
            onChange={(event) => updateState({ ...state, valueColumn: Number(event.target.value) })}
          >
            {headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
          </select>
        </label>
        <label><span>Calculate</span>
          <select
            aria-label="Pivot calculation"
            value={state.aggregation}
            onChange={(event) =>
              updateState({ ...state, aggregation: event.target.value as PivotAggregation })}
          >
            {Object.entries(aggregationLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="gp-table-pivot-report gp-table-scroll">
        <header>
          <span>{headers[state.groupBy]}</span>
          <span>{aggregationLabels[state.aggregation]} of {headers[state.valueColumn]}</span>
        </header>
        {results.map((result, index) => (
          <div key={result.label}>
            <span className="gp-table-pivot-rank">{String(index + 1).padStart(2, '0')}</span>
            <strong>{result.label}</strong>
            <i><b style={{ width: `${Math.max(3, Math.abs(result.value) / max * 100)}%` }} /></i>
            <span>{result.value.toLocaleString(undefined, {
              maximumFractionDigits: Number.isInteger(result.value) ? 0 : 1,
            })}</span>
            <small>{result.count} {result.count === 1 ? 'row' : 'rows'}</small>
          </div>
        ))}
        {results.length === 0 && (
          <div className="gp-table-empty"><BarChart3 size={19} /><strong>No records to summarize</strong></div>
        )}
      </div>
    </div>
  )
}

interface TableStudioProps {
  rows: string[][]
  renderCellInput: GridViewProps['renderCellInput']
  addRow: (seed?: string[]) => void
  addColumn: () => void
  removeRow: (rowIndex: number) => void
  removeColumn: (columnIndex?: number) => void
  onClose: () => void
}

function TableStudio({
  rows,
  renderCellInput,
  addRow,
  addColumn,
  removeRow,
  removeColumn,
  onClose,
}: TableStudioProps) {
  return (
    <div className="gp-table-studio" role="dialog" aria-label="Table data studio">
      <header>
        <span><Table2 size={13} /></span>
        <div><strong>Table studio</strong><small>Edit the shared rows behind every view</small></div>
        <button type="button" aria-label="Close table studio" onClick={onClose}><X size={12} /></button>
      </header>
      <div className="gp-table-studio-grid gp-table-scroll">
        <table>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} data-header={rowIndex === 0 || undefined}>
                <th>{rowIndex === 0 ? '#' : rowIndex}</th>
                {row.map((_, columnIndex) => (
                  <td key={columnIndex}>{renderCellInput(rowIndex, columnIndex, { compact: true })}</td>
                ))}
                <td>
                  {rowIndex > 0 && (
                    <button
                      type="button"
                      aria-label={`Remove studio row ${rowIndex}`}
                      onClick={() => removeRow(rowIndex)}
                    >
                      <X size={9} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer>
        <button type="button" onClick={() => addRow()}><Plus size={10} /> Record</button>
        <button type="button" onClick={addColumn}><Plus size={10} /> Field</button>
        {rows[0]!.length > 1 && (
          <button type="button" data-danger onClick={() => removeColumn()}>
            <Minus size={10} /> Last field
          </button>
        )}
      </footer>
    </div>
  )
}
