import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { TableData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { summarizeNumericColumn } from '../../../utils/widgetValueValidation'

interface TableWidgetProps {
  data: TableData
  onChange: (data: TableData) => void
}

export function TableWidget({ data, onChange }: TableWidgetProps) {
  const cellRefs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocusKey = useRef<string | null>(null)
  const rowCountRef = useFieldAnchor('row_count')
  const [selected,setSelected]=useState({row:0,col:0})

  useEffect(() => {
    if (!pendingFocusKey.current) return
    cellRefs.current.get(pendingFocusKey.current)?.focus()
    pendingFocusKey.current = null
  })

  const columnCount = data.rows[0]?.length ?? 1

  const setCell = (rowIndex: number, colIndex: number, value: string) =>
    onChange({
      rows: data.rows.map((row, r) =>
        r === rowIndex ? row.map((cell, c) => (c === colIndex ? value : cell)) : row,
      ),
    })

  const addRow = () =>
    onChange({ rows: [...data.rows, Array.from({ length: columnCount }, () => '')] })

  const removeRow = (rowIndex: number) =>
    onChange({ rows: data.rows.filter((_, r) => r !== rowIndex) })

  const addColumn = () => onChange({ rows: data.rows.map((row) => [...row, '']) })

  const removeColumn = () => {
    if (columnCount < 2) return
    onChange({ rows: data.rows.map((row) => row.slice(0, -1)) })
  }

  const onCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number,
  ) => {
    const deltas:Record<string,[number,number]>={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1],Enter:[1,0]}
    const delta=deltas[e.key];if(!delta)return;e.preventDefault()
    const row=Math.max(0,Math.min(data.rows.length-1,rowIndex+delta[0]));const col=Math.max(0,Math.min(columnCount-1,colIndex+delta[1]))
    if(e.key==='Enter'&&rowIndex===data.rows.length-1){pendingFocusKey.current=`${rowIndex+1}:${colIndex}`;addRow();return}
    setSelected({row,col});cellRefs.current.get(`${row}:${col}`)?.focus()
  }

  return (
    <div data-floor-panel="rows" className="flex h-full flex-col gap-0">
      {/* Table — rows are 36px each so 3 rows + 28px footer = 136px = inner height at default size */}
      <div data-floor-overflow="scroll" className="flex-1 overflow-hidden rounded-lg border gp-hairline">
        <table className="w-full border-collapse">
          <tbody>
            {data.rows.map((row, rowIndex) => {
              const isHeader = rowIndex === 0
              return (
                <tr
                  key={rowIndex}
                  className={`group/row ${
                    isHeader ? 'bg-neutral-800/50' : 'hover:bg-neutral-800/20'
                  }`}
                >
                  {row.map((cell, colIndex) => (
                    <td
                      key={colIndex}
                      className={`relative p-0 ${
                        colIndex < row.length - 1 ? 'border-r gp-hairline' : ''
                      } ${rowIndex < data.rows.length - 1 ? 'border-b gp-hairline' : ''}`}
                    >
                      <input
                        data-floor-label
                        ref={(el) => {
                          const key = `${rowIndex}:${colIndex}`
                          if (el) cellRefs.current.set(key, el)
                          else cellRefs.current.delete(key)
                        }}
                        value={cell}
                        aria-label={`Cell ${rowIndex + 1}, ${colIndex + 1}`}
                        placeholder={isHeader ? `Column ${colIndex + 1}` : ''}
                        onChange={(e) => setCell(rowIndex, colIndex, e.target.value)}
                        onFocus={()=>setSelected({row:rowIndex,col:colIndex})}
                        onKeyDown={(e) => onCellKeyDown(e, rowIndex, colIndex)}
                        className={`gp-input--bare h-9 w-full px-2.5 text-xs outline-none transition-colors duration-100 placeholder:text-neutral-700 ${selected.row===rowIndex&&selected.col===colIndex?'ring-1 ring-inset ring-[color-mix(in_oklab,var(--gp-widget-accent),transparent_55%)]':''} ${
                          isHeader
                            ? 'font-semibold uppercase tracking-wide text-neutral-400'
                            : 'text-neutral-200'
                        }`}
                      />
                    </td>
                  ))}
                  {/* Per-row delete — last column, only in non-header rows with 2+ rows */}
                  {!isHeader && data.rows.length > 2 && (
                    <td className="w-0 p-0">
                      <button
                        type="button"
                        aria-label={`Remove row ${rowIndex + 1}`}
                        onClick={() => removeRow(rowIndex)}
                        className="flex h-9 w-6 items-center justify-center text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
                      >
                        <Minus size={11} />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer controls — 28px, compact pill buttons */}
      <div ref={rowCountRef} className="flex h-7 shrink-0 items-center gap-1 pt-1.5">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-neutral-600 transition-colors hover:bg-neutral-800/60 hover:text-neutral-300"
        >
          <Plus size={10} /> Row
        </button>
        <button
          type="button"
          onClick={addColumn}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-neutral-600 transition-colors hover:bg-neutral-800/60 hover:text-neutral-300"
        >
          <Plus size={10} /> Col
        </button>
        {columnCount > 1 && (
          <button
            type="button"
            aria-label="Remove last column"
            onClick={removeColumn}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-neutral-700 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Minus size={10} /> Col
          </button>
        )}
        <span className="ml-auto font-mono text-[9px] text-emerald-200/70">{summarizeNumericColumn(data.rows, selected.col) ?? `R${selected.row+1} C${selected.col+1} · no numeric data`}</span>
      </div>
    </div>
  )
}
