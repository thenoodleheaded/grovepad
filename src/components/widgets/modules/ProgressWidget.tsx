import type { ProgressData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface ProgressWidgetProps {
  data: ProgressData
  onChange: (data: ProgressData) => void
}

function nudge(data: ProgressData, delta: number, onChange: (d: ProgressData) => void) {
  const next = Math.min(100, Math.max(0, data.percent + delta))
  if (next !== data.percent) onChange({ ...data, percent: next })
}

/** Labeled progress meter with ±1 / ±10 nudge buttons. Default card height: C×3 (120px). */
export function ProgressWidget({ data, onChange }: ProgressWidgetProps) {
  const percent = Math.min(100, Math.max(0, Number.isFinite(data.percent) ? data.percent : 0))
  // Field wires for `percent` anchor to the progress track row.
  const percentRowRef = useFieldAnchor('percent')

  // Pick accent color based on how far along we are.
  const accentClass =
    percent === 100
      ? 'text-emerald-400'
      : percent >= 70
        ? 'text-blue-400'
        : percent >= 30
          ? 'text-sky-400'
          : 'text-neutral-400'

  const barColor =
    percent === 100
      ? 'from-emerald-600 to-emerald-400'
      : percent >= 70
        ? 'from-blue-600 to-blue-400'
        : 'from-sky-600 to-sky-400'

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      {/* Label row — editable */}
      <div className="flex items-center justify-between gap-2">
        <input
          value={data.label}
          placeholder="Label…"
          aria-label="Progress label"
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          className="gp-input--bare flex-1 text-[13px] text-neutral-200 outline-none placeholder:text-neutral-700"
        />
        <span
          className={`gp-hero shrink-0  transition-colors duration-300 ${percent === 100 ? accentClass : ''}`}
        >
          {percent}%
        </span>
      </div>

      {/* The liquid itself is the control: pointer drag and arrow keys both set it. */}
      <div
        ref={percentRowRef}
        role="slider"
        tabIndex={0}
        aria-label="Progress percentage"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        onKeyDown={(event) => {
          if (!['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(event.key)) return
          event.preventDefault()
          if (event.key==='Home') onChange({...data,percent:0})
          else if(event.key==='End') onChange({...data,percent:100})
          else nudge(data,event.key==='ArrowRight'||event.key==='ArrowUp'?1:-1,onChange)
        }}
        onPointerDown={(event) => {
          const control=event.currentTarget
          control.setPointerCapture(event.pointerId)
          const set=(clientX:number)=>{const rect=control.getBoundingClientRect();onChange({...data,percent:Math.round(Math.max(0,Math.min(1,(clientX-rect.left)/rect.width))*100)})}
          set(event.clientX)
          control.onpointermove=(move)=>set(move.clientX)
          control.onpointerup=()=>{control.onpointermove=null;control.onpointerup=null}
        }}
        className="relative h-9 cursor-ew-resize overflow-hidden rounded-full border border-white/20 bg-neutral-950 shadow-[inset_0_4px_8px_#000,0_1px_rgba(255,255,255,.15)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 touch-none"
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-200 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
        <span className="pointer-events-none absolute inset-y-1 w-1 rounded-full bg-white/70 shadow-[0_0_8px_white]" style={{left:`calc(${percent}% - 2px)`}} />
        <span className="pointer-events-none absolute inset-x-3 top-1/2 border-t border-dashed border-white/15" />
      </div>
      <p className="text-center text-[9px] tracking-widest text-neutral-600">DRAG THE LIQUID · ARROWS FINE-TUNE</p>
    </div>
  )
}
