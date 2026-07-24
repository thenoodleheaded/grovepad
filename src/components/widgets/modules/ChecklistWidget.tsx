import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { ChecklistData } from '../../../types/spatial'
import { WidgetPanel } from '../WidgetPanel'
import { withoutPanelItem } from '../panelRemoval'

interface ChecklistWidgetProps {
  data: ChecklistData
  onChange: (data: ChecklistData) => void
  onHeightChange?: (height: number) => void
}

/**
 * One task, one island, one row — a checklist is read top to bottom, so two
 * tasks never share a line and a new row always means a new task. The card is
 * content-driven in both axes (`sizing.fixed`), so there is no handle to drag
 * it out of agreement with its own list.
 */
export function ChecklistWidget({ data, onChange, onHeightChange }: ChecklistWidgetProps) {
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocusId = useRef<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    if (!pendingFocusId.current) return
    inputRefs.current.get(pendingFocusId.current)?.focus()
    pendingFocusId.current = null
  })

  // Height always follows the wrapped chip flow — never hides, never pads.
  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  })

  const toggleItem = (id: string) =>
    onChange({
      items: data.items.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    })

  const setLabel = (id: string, label: string) =>
    onChange({ items: data.items.map((item) => (item.id === id ? { ...item, label } : item)) })

  const beginRemove = (id: string) => {
    setRemovingIds((prev) => new Set(prev).add(id))
  }

  const finishRemove = (id: string) => {
    setRemovingIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    onChange({ items: withoutPanelItem(data.items, id) })
  }

  const insertAfter = (index: number) => {
    const item = { id: crypto.randomUUID(), label: '', done: false }
    const items = [...data.items]
    items.splice(index + 1, 0, item)
    pendingFocusId.current = item.id
    onChange({ items })
  }

  const onItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    const item = data.items[index]
    if (!item) return
    if (e.key === 'Enter') {
      e.preventDefault()
      insertAfter(index)
    } else if (e.key === 'Backspace' && item.label === '' && data.items.length > 1) {
      e.preventDefault()
      const neighbor = data.items[index - 1] ?? data.items[index + 1]
      if (neighbor) pendingFocusId.current = neighbor.id
      beginRemove(item.id)
    }
  }

  const doneCount = data.items.filter((i) => i.done).length
  const totalCount = data.items.length

  return (
    <div ref={rootRef} className="flex flex-col items-stretch gap-1">
      {data.items.map((item, index) => (
        <WidgetPanel
          key={item.id}
          removing={removingIds.has(item.id)}
          onExitComplete={() => finishRemove(item.id)}
          floor="controls"
          className="group/row flex h-8 w-full items-center gap-2 px-2.5 pr-3"
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={item.done}
            aria-label={item.label || 'Untitled task'}
            onClick={() => toggleItem(item.id)}
            className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border transition-all duration-150 ${
              item.done
                ? 'border-emerald-500/60 bg-emerald-500/15'
                : 'border-neutral-600 bg-transparent hover:border-neutral-400'
            }`}
          >
            {item.done && (
              <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden>
                <path
                  d="M1 3.5L3.2 5.5L8 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-emerald-400"
                />
              </svg>
            )}
          </button>

          <input
            ref={(el) => {
              if (el) inputRefs.current.set(item.id, el)
              else inputRefs.current.delete(item.id)
            }}
            value={item.label}
            placeholder="Task…"
            onChange={(e) => setLabel(item.id, e.target.value)}
            onKeyDown={(e) => onItemKeyDown(e, index)}
            className={`gp-chip-input min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-neutral-700 transition-colors duration-150 ${
              item.done
                ? 'text-neutral-600 line-through decoration-neutral-600/50'
                : 'text-neutral-200'
            }`}
          />

          <button
            type="button"
            aria-label="Remove task"
            onClick={() => beginRemove(item.id)}
            className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
          >
            <X size={11} />
          </button>
        </WidgetPanel>
      ))}

      <button
        type="button"
        onClick={() => insertAfter(data.items.length - 1)}
        className="flex h-7 shrink-0 items-center gap-1.5 self-start px-2.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
      >
        <Plus size={11} />
        Add task
        {totalCount > 0 && (
          <span
            aria-label={`${doneCount} of ${totalCount} done`}
            className={`ml-1  text-[10px] tabular-nums transition-colors duration-300 ${
              doneCount === totalCount ? '' : 'text-neutral-600'
            }`}
            style={doneCount === totalCount ? { color: 'var(--gp-widget-accent)' } : undefined}
          >
            {doneCount}/{totalCount}
          </span>
        )}
      </button>
    </div>
  )
}
