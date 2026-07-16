import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { NotesData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface NotesWidgetProps {
  data: NotesData
  onChange: (data: NotesData) => void
  onHeightChange?: (height: number) => void
}

export function NotesWidget({ data, onChange, onHeightChange }: NotesWidgetProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const textFieldRef = useFieldAnchor<HTMLTextAreaElement>('text')
  const [localText, setLocalText] = useState(data.text)

  useEffect(() => {
    setLocalText(data.text)
  }, [data.text])

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    onHeightChange?.(el.scrollHeight)
  }, [localText, onHeightChange])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setLocalText(val)
    onChange({ text: val })
  }

  const wordCount = localText.trim() ? localText.trim().split(/\s+/).length : 0

  return (
    <div data-floor-panel="reflow" data-floor-min-w="112" className="gp-bare-field flex h-full flex-col">
      <textarea
        ref={(el) => {
          textareaRef.current = el
          textFieldRef.current = el
        }}
        value={localText}
        rows={2}
        placeholder="Start writing…"
        onChange={handleChange}
        className="flex-1 w-full resize-none bg-transparent text-[13px] leading-[1.65] text-neutral-100 outline-none placeholder:text-neutral-700 selection:bg-amber-500/20"
      />
      {wordCount > 0 && (
        <span
          aria-hidden
          className="mt-1 shrink-0 select-none self-end font-mono text-[9px] text-neutral-700"
        >
          {wordCount}w
        </span>
      )}
    </div>
  )
}
