import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import type { KanbanCard, KanbanData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface KanbanWidgetProps {
  data: KanbanData
  onChange: (data: KanbanData) => void
}

const COLUMN_ACCENTS = ['text-sky-300', 'text-amber-300', 'text-emerald-300']
/** Matching hex hues for the column washes (sky-300, amber-300, emerald-300). */
const COLUMN_HEX = ['#7dd3fc', '#fcd34d', '#6ee7b7']

/** Lightweight three-column board — hover arrows move cards between columns. */
export function KanbanWidget({ data, onChange }: KanbanWidgetProps) {
  const [dragging,setDragging]=useState<{column:number;cardId:string}|null>(null)
  const [dropColumn,setDropColumn]=useState<number|null>(null)
  // The last column is conventionally "Done" — its count is the wireable one.
  const doneCountRef = useFieldAnchor<HTMLSpanElement>('done_count')

  const setColumnLabel = (columnId: string, label: string) =>
    onChange({
      columns: data.columns.map((c) => (c.id === columnId ? { ...c, label } : c)),
    })

  const setCardLabel = (columnId: string, cardId: string, label: string) =>
    onChange({
      columns: data.columns.map((c) =>
        c.id === columnId
          ? { ...c, cards: c.cards.map((card) => (card.id === cardId ? { ...card, label } : card)) }
          : c,
      ),
    })

  const addCard = (columnId: string) =>
    onChange({
      columns: data.columns.map((c) =>
        c.id === columnId
          ? { ...c, cards: [...c.cards, { id: crypto.randomUUID(), label: '' }] }
          : c,
      ),
    })

  const removeCard = (columnId: string, cardId: string) =>
    onChange({
      columns: data.columns.map((c) =>
        c.id === columnId ? { ...c, cards: c.cards.filter((card) => card.id !== cardId) } : c,
      ),
    })

  const moveCard = (fromIndex: number, cardId: string, direction: 1 | -1) => {
    const toIndex = fromIndex + direction
    const from = data.columns[fromIndex]
    const to = data.columns[toIndex]
    if (!from || !to) return
    const card = from.cards.find((c) => c.id === cardId)
    if (!card) return
    const columns = data.columns.map((c, i) => {
      if (i === fromIndex) return { ...c, cards: c.cards.filter((x) => x.id !== cardId) }
      if (i === toIndex) return { ...c, cards: [...c.cards, card] }
      return c
    })
    onChange({ columns })
  }
  const dropCard=(toIndex:number)=>{if(!dragging||dragging.column===toIndex)return;const from=data.columns[dragging.column];const card=from?.cards.find(item=>item.id===dragging.cardId);if(!from||!card)return;onChange({columns:data.columns.map((column,index)=>index===dragging.column?{...column,cards:column.cards.filter(item=>item.id!==dragging.cardId)}:index===toIndex?{...column,cards:[...column.cards,card]}:column)});setDragging(null);setDropColumn(null)}

  return (
    <div className="flex h-full gap-2">
      {data.columns.map((column, columnIndex) => {
        const hue = COLUMN_HEX[columnIndex % COLUMN_HEX.length]!
        return (
        <div
          key={column.id}
          onDragOver={event=>{event.preventDefault();setDropColumn(columnIndex)}}
          onDragLeave={()=>setDropColumn(current=>current===columnIndex?null:current)}
          onDrop={event=>{event.preventDefault();dropCard(columnIndex)}}
          className={`flex min-w-0 flex-1 flex-col rounded-xl border p-1.5 transition-[box-shadow,background-color] ${dropColumn===columnIndex?'border-emerald-300/50 bg-emerald-300/10 shadow-[inset_0_0_18px_rgba(110,231,183,.14)]':'gp-hairline bg-neutral-900/40'}`}
          style={{
            backgroundImage: `linear-gradient(180deg, ${hue}12 0%, transparent 42%)`,
            boxShadow: `inset 0 1px 0 ${hue}2b`,
          }}
        >
          <div className="flex items-center justify-between gap-1 px-1 pb-1">
            <input
              value={column.label}
              placeholder="Column…"
              aria-label="Column name"
              onChange={(e) => setColumnLabel(column.id, e.target.value)}
              className={`w-full min-w-0 bg-transparent text-[10px] font-semibold uppercase tracking-wider outline-none placeholder:text-neutral-700 ${
                COLUMN_ACCENTS[columnIndex % COLUMN_ACCENTS.length]
              }`}
            />
            <span
              ref={columnIndex === data.columns.length - 1 ? doneCountRef : undefined}
              className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 font-mono text-[9px] tabular-nums"
              style={{ color: hue, background: `${hue}1a` }}
            >
              {column.cards.length}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {column.cards.map((card: KanbanCard) => (
              <div
                key={card.id}
                draggable
                onDragStart={()=>setDragging({column:columnIndex,cardId:card.id})}
                onDragEnd={()=>{setDragging(null);setDropColumn(null)}}
                className={`group/kcard relative flex h-[30px] shrink-0 cursor-grab items-center rounded-sm border border-black/10 bg-[#eee8d7] px-1.5 text-stone-800 shadow-[0_2px_4px_rgba(0,0,0,.22)] transition-[border-color,translate,box-shadow,opacity] duration-150 hover:-translate-y-px active:cursor-grabbing ${dragging?.cardId===card.id?'rotate-[2deg] opacity-45':''}`}
              >
                {columnIndex > 0 && (
                  <button
                    type="button"
                    aria-label="Move left"
                    onClick={() => moveCard(columnIndex, card.id, -1)}
                    className="absolute -left-1 hidden h-4 w-4 items-center justify-center rounded-full border border-neutral-600 bg-neutral-950 text-neutral-400 hover:text-white group-hover/kcard:flex"
                  >
                    <ChevronLeft size={9} aria-hidden />
                  </button>
                )}
                <input
                  value={card.label}
                  placeholder="Card…"
                  onChange={(e) => setCardLabel(column.id, card.id, e.target.value)}
                  className="w-full min-w-0 bg-transparent text-[11px] text-stone-800 outline-none placeholder:text-stone-400"
                />
                <button
                  type="button"
                  aria-label="Remove card"
                  onClick={() => removeCard(column.id, card.id)}
                  className="hidden shrink-0 text-neutral-700 hover:text-red-400 group-hover/kcard:block"
                >
                  <X size={10} aria-hidden />
                </button>
                {columnIndex < data.columns.length - 1 && (
                  <button
                    type="button"
                    aria-label="Move right"
                    onClick={() => moveCard(columnIndex, card.id, 1)}
                    className="absolute -right-1 hidden h-4 w-4 items-center justify-center rounded-full border border-neutral-600 bg-neutral-950 text-neutral-400 hover:text-white group-hover/kcard:flex"
                  >
                    <ChevronRight size={9} aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => addCard(column.id)}
            className="mt-1 flex h-6 shrink-0 items-center justify-center gap-1 rounded-lg text-[10px] text-neutral-600 transition-colors hover:bg-neutral-800/60 hover:text-neutral-400"
          >
            <Plus size={10} aria-hidden />
            Add
          </button>
        </div>
        )
      })}
    </div>
  )
}
