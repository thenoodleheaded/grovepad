import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { BulletsData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'
import { WidgetPanel } from '../WidgetPanel'
import { withoutPanelItem } from '../panelRemoval'

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
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocusId = useRef<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set())
  const countRef = useFieldAnchor<HTMLButtonElement>('count')

  useEffect(() => {
    if (pendingFocusId.current === null) return
    inputRefs.current.get(pendingFocusId.current)?.focus()
    pendingFocusId.current = null
  })

  useLayoutEffect(() => {
    if (rootRef.current) onHeightChange?.(rootRef.current.scrollHeight)
  })

  const setItem = (id: string, text: string) =>
    onChange({ items: data.items.map((item) => (item.id === id ? { ...item, text } : item)) })

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
    const item = { id: crypto.randomUUID(), text: '' }
    const items = [...data.items]
    items.splice(index + 1, 0, item)
    pendingFocusId.current = item.id
    onChange({ items })
  }

  const onItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      insertAfter(index)
    } else if (e.key === 'Backspace' && data.items[index]?.text === '' && data.items.length > 1) {
      e.preventDefault()
      const neighbor = data.items[index - 1] ?? data.items[index + 1]
      if (neighbor) pendingFocusId.current = neighbor.id
      const item = data.items[index]
      if (item) beginRemove(item.id)
    }
  }

  return (
    <div ref={rootRef} className="flex flex-wrap content-start items-start gap-1">
      {data.items.map((item, index) => (
        <WidgetPanel
          key={item.id}
          island={item.id}
          removing={removingIds.has(item.id)}
          onExitComplete={() => finishRemove(item.id)}
          sizing="width"
          className="group/row flex h-8 items-center gap-2 px-2.5 pr-4"
        >
          <span aria-hidden className="shrink-0 select-none text-[7px] text-sky-400/70">
            ◆
          </span>
          <input
            ref={(el) => {
              if (el) inputRefs.current.set(item.id, el)
              else inputRefs.current.delete(item.id)
            }}
            value={item.text}
            placeholder="List item  ↵ adds another"
            onChange={(e) => setItem(item.id, e.target.value)}
            onKeyDown={(e) => onItemKeyDown(e, index)}
            className="gp-chip-input bg-transparent text-[13px] text-neutral-200 outline-none placeholder:text-neutral-700"
          />
          {data.items.length > 1 && (
            <button
              type="button"
              aria-label="Remove bullet"
              onClick={() => beginRemove(item.id)}
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
