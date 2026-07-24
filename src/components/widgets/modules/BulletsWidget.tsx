import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { BulletsData } from '../../../types/spatial'
import { WidgetPanel } from '../WidgetPanel'
import { withoutPanelItem } from '../panelRemoval'

interface BulletsWidgetProps {
  data: BulletsData
  onChange: (data: BulletsData) => void
  onHeightChange?: (height: number) => void
}

/**
 * One bullet, one island, one row — however many bullets are added. A list
 * that re-flows two points onto a line stops reading as a list, so the stack
 * stays vertical and the card's height follows it.
 */
export function BulletsWidget({ data, onChange, onHeightChange }: BulletsWidgetProps) {
  const inputRefs = useRef(new Map<string, HTMLInputElement>())
  const pendingFocusId = useRef<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set())
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
    <div ref={rootRef} className="flex flex-col items-stretch gap-1">
      {data.items.map((item, index) => (
        <WidgetPanel
          key={item.id}
          removing={removingIds.has(item.id)}
          onExitComplete={() => finishRemove(item.id)}
          floor="controls"
          className="group/row flex h-8 w-full items-center gap-2 px-2.5 pr-3"
        >
          <span aria-hidden className="shrink-0 select-none text-[7px] text-sky-400/70">
            ◆
          </span>
          <input
            data-floor-overflow="scroll"
            ref={(el) => {
              if (el) inputRefs.current.set(item.id, el)
              else inputRefs.current.delete(item.id)
            }}
            value={item.text}
            placeholder="List item  ↵ adds another"
            onChange={(e) => setItem(item.id, e.target.value)}
            onKeyDown={(e) => onItemKeyDown(e, index)}
            className="gp-chip-input min-w-0 flex-1 bg-transparent text-[13px] text-neutral-200 outline-none placeholder:text-neutral-700"
          />
          {data.items.length > 1 && (
            <button
              type="button"
              aria-label="Remove bullet"
              onClick={() => beginRemove(item.id)}
              className="shrink-0 text-neutral-700 pointer-events-none opacity-0 transition-opacity hover:text-red-400 group-hover/row:opacity-100 group-hover/row:pointer-events-auto"
            >
              <X size={11} />
            </button>
          )}
        </WidgetPanel>
      ))}

      <button

        type="button"
        onClick={() => insertAfter(data.items.length - 1)}
        className="flex h-7 shrink-0 items-center gap-1.5 self-start px-2.5 text-[11px] text-neutral-600 transition-colors hover:text-neutral-400"
      >
        <Plus size={11} />
        Add bullet
      </button>
    </div>
  )
}
