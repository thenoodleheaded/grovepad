import { useRef, useState } from 'react'
import { Eraser, Pen } from 'lucide-react'
import type { SketchpadData, Vector2D } from '../../../types/spatial'

interface SketchpadWidgetProps {
  data: SketchpadData
}

type Tool = 'pen' | 'eraser'

/**
 * Drawing surface placeholder. Tracks the pointer to prove interactivity;
 * the stroke engine integrates here later.
 */
export function SketchpadWidget({ data: _data }: SketchpadWidgetProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState<Vector2D | null>(null)
  const [activeTool, setActiveTool] = useState<Tool>('pen')

  const tools = [
    { id: 'pen' as Tool, Icon: Pen, label: 'Pen' },
    { id: 'eraser' as Tool, Icon: Eraser, label: 'Eraser' },
  ]

  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex h-7 shrink-0 items-center gap-1">
        {tools.map(({ id, Icon, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeTool === id}
            aria-label={label}
            onClick={() => setActiveTool(id)}
            className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors ${
              activeTool === id
                ? 'bg-neutral-700/80 text-neutral-200'
                : 'text-neutral-600 hover:bg-neutral-800/60 hover:text-neutral-400'
            }`}
          >
            <Icon size={11} aria-hidden />
            {label}
          </button>
        ))}
        <span aria-live="polite" aria-atomic="true" className="ml-auto font-mono text-[9px] text-neutral-700 select-none">
          {pointer ? `${pointer.x}, ${pointer.y}` : '—'}
        </span>
      </div>
      <div
        ref={surfaceRef}
        style={{ cursor: activeTool === 'eraser' ? 'cell' : 'crosshair' }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setPointer({ x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) })
        }}
        onPointerLeave={() => setPointer(null)}
        className="gp-sketch-surface relative flex-1 overflow-hidden rounded-lg border gp-hairline"
      >
        {pointer && <><div aria-hidden className="pointer-events-none absolute top-0 w-px bg-neutral-600/30" style={{ left: pointer.x, height: '100%' }} /><div aria-hidden className="pointer-events-none absolute left-0 h-px bg-neutral-600/30" style={{ top: pointer.y, width: '100%' }} /></>}
        {!pointer && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5"><Pen size={16} className="text-neutral-700" aria-hidden /><span className="text-[11px] text-neutral-700">Drawing engine pending</span></div>}
      </div>
    </div>
  )
}
