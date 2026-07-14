import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { BulletsData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { PANEL_EXIT_MS, WidgetPanel } from '../WidgetPanel'

interface BulletsWidgetProps {
  data: BulletsData
  onChange: (data: BulletsData) => void
  onHeightChange?: (height: number) => void
}

/**
 * Every bullet is its own glass subpanel chip, plus one panel for the add
 * button. Width resize only re-wraps chips onto new lines; height always
 * follows the flow.
 */
export function BulletsWidget({ data, onChange, onHeightChange }: BulletsWidgetProps) {
  const inputRefs = useRef(new Map<number, HTMLInputElement>())
  const pendingFocusIndex = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const latestItems = useRef(data.items)
  latestItems.current = data.items
  const [removingIndexes, setRemovingIndexes] = useState<ReadonlySet<number>>(new Set())
  const countRef = useFieldAnchor<HTMLButtonElement>('count')

  useEffect(() => {
    if (pendingFocusIndex.current === null) return
    inputRefs.current.get(pendingFocusIndex.current)?.focus()
    pendingFocusIndex.current = null
  })

  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  })

  const setItem = (index: number, value: string) =>
    onChange({ items: data.items.map((item, i) => (i === index ? value : item)) })

  const removeItem = (index: number) => {
    setRemovingIndexes((prev) => new Set(prev).add(index))
    setTimeout(() => {
      setRemovingIndexes(new Set())
      onChange({ items: latestItems.current.filter((_, i) => i !== index) })
    }, PANEL_EXIT_MS)
  }

  const insertAfter = (index: number) => {
    const items = [...data.items]
    items.splice(index + 1, 0, '')
    pendingFocusIndex.current = index + 1
    onChange({ items })
  }

  const onItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      insertAfter(index)
    } else if (e.key === 'Backspace' && data.items[index] === '' && data.items.length > 1) {
      e.preventDefault()
      pendingFocusIndex.current = Math.max(0, index - 1)
      removeItem(index)
    }
  }

  return (
    <div ref={rootRef} className="flex flex-wrap content-start items-start gap-1">
      {data.items.map((item, index) => (
        <WidgetPanel
          key={index}
          removing={removingIndexes.has(index)}
          sizing="width"
          className="group/row flex h-8 items-center gap-2 px-2.5 pr-4"
        >
          <span aria-hidden className="shrink-0 select-none text-[7px] text-sky-400/70">
            ◆
          </span>
          <input
            ref={(el) => {
              if (el) inputRefs.current.set(index, el)
              else inputRefs.current.delete(index)
            }}
            value={item}
            placeholder="List item  ↵ adds another"
            onChange={(e) => setItem(index, e.target.value)}
            onKeyDown={(e) => onItemKeyDown(e, index)}
            className="gp-chip-input bg-transparent text-[13px] text-neutral-200 outline-none placeholder:text-neutral-700"
          />
          {data.items.length > 1 && (
            <button
              type="button"
              aria-label="Remove bullet"
              onClick={() => removeItem(index)}
              className="shrink-0 text-neutral-700 opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100"
            >
              <X size={11} />
            </button>
          )}
        </WidgetPanel>
      ))}

      {/* Add button — its own subdivision panel. */}
      <WidgetPanel grip={false} island="add" sizing="fixed" className="flex h-8 items-center border-dashed px-2.5">
        <button
          ref={countRef}
          type="button"
          onClick={() => insertAfter(data.items.length - 1)}
          className="flex items-center gap-1.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
        >
          <Plus size={11} />
          Add bullet
        </button>
      </WidgetPanel>
    </div>
  )
}
