import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Eraser, Pen, Redo2, Trash2, Undo2 } from 'lucide-react'
import { useFocusStore } from '../../../store/useFocusStore'
import { useWidgetStore } from '../../../store/useWidgetStore'
import type {
  SketchpadData,
  SketchpadPoint,
  SketchpadStroke,
} from '../../../types/widgetDataCore'
import {
  eraseSketchStrokes,
  simplifySketchPoints,
  shouldStartSketchStroke,
  sketchPointDistancePixels,
  sketchPointFromPointer,
  sketchStrokeWidth,
} from '../../../utils/sketchpadStroke'

interface SketchpadWidgetProps {
  widgetId: string
  data: SketchpadData
  onChange: (data: SketchpadData) => void
}

type Tool = 'pen' | 'eraser'

const COLORS = ['#f8fafc', '#fde047', '#38bdf8', '#fb7185'] as const
const SIZES = [2, 4, 7] as const

function strokeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `stroke-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: SketchpadStroke,
  width: number,
  height: number,
) {
  const points = stroke.points
  if (points.length === 0) return
  context.strokeStyle = stroke.color
  context.fillStyle = stroke.color
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (points.length === 1) {
    const point = points[0]!
    context.beginPath()
    context.arc(
      point.x * width,
      point.y * height,
      sketchStrokeWidth(stroke.size, point.pressure) / 2,
      0,
      Math.PI * 2,
    )
    context.fill()
    return
  }
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!
    const current = points[index]!
    context.lineWidth = sketchStrokeWidth(
      stroke.size,
      (previous.pressure + current.pressure) / 2,
    )
    context.beginPath()
    context.moveTo(previous.x * width, previous.y * height)
    context.lineTo(current.x * width, current.y * height)
    context.stroke()
  }
}

/**
 * Lightweight native drawing for fast notes. Pointer samples and paint stay
 * in refs and one requestAnimationFrame loop; React/store update only when a
 * complete stroke (or erase gesture) is committed.
 */
export function SketchpadWidget({ widgetId, data, onChange }: SketchpadWidgetProps) {
  const drawingEnabled = useFocusStore((state) => state.focusedWidgetId === widgetId)
  const canUndo = useWidgetStore((state) => state.canUndo)
  const canRedo = useWidgetStore((state) => state.canRedo)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hoverRef = useRef<HTMLDivElement>(null)
  const strokesRef = useRef<readonly SketchpadStroke[]>(data.strokes ?? [])
  const activeStrokeRef = useRef<SketchpadStroke | null>(null)
  const gestureStartRef = useRef<readonly SketchpadStroke[]>(strokesRef.current)
  const activePointerRef = useRef<number | null>(null)
  const paintFrameRef = useRef(0)
  const dataRef = useRef(data)
  const [activeTool, setActiveTool] = useState<Tool>('pen')
  const [color, setColor] = useState<(typeof COLORS)[number]>(COLORS[0])
  const [size, setSize] = useState<(typeof SIZES)[number]>(SIZES[1])

  dataRef.current = data

  const paint = () => {
    paintFrameRef.current = 0
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const rect = canvas.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const targetWidth = Math.max(1, Math.round(rect.width * ratio))
    const targetHeight = Math.max(1, Math.round(rect.height * ratio))
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, rect.width, rect.height)
    for (const stroke of strokesRef.current) drawStroke(context, stroke, rect.width, rect.height)
    if (activeStrokeRef.current) {
      drawStroke(context, activeStrokeRef.current, rect.width, rect.height)
    }
  }

  const schedulePaint = () => {
    if (paintFrameRef.current === 0) paintFrameRef.current = requestAnimationFrame(paint)
  }

  useEffect(() => {
    strokesRef.current = data.strokes ?? []
    activeStrokeRef.current = null
    schedulePaint()
    // `schedulePaint` deliberately reads the latest refs and is not itself a
    // reactive input; data identity is the persistence boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(schedulePaint)
    observer.observe(canvas)
    schedulePaint()
    return () => {
      observer.disconnect()
      if (paintFrameRef.current !== 0) cancelAnimationFrame(paintFrameRef.current)
      paintFrameRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commit = (strokes: readonly SketchpadStroke[]) => {
    strokesRef.current = strokes
    activeStrokeRef.current = null
    onChange({ ...dataRef.current, strokes })
    schedulePaint()
  }

  const pointerPoint = (event: ReactPointerEvent<HTMLCanvasElement>): SketchpadPoint =>
    sketchPointFromPointer(event.currentTarget.getBoundingClientRect(), event.nativeEvent)

  const updatePencilHover = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const hover = hoverRef.current
    if (!hover) return
    const visible =
      event.pointerType === 'pen' &&
      event.buttons === 0 &&
      drawingEnabled &&
      document.documentElement.dataset.pencilHover !== 'off'
    if (!visible) {
      hover.hidden = true
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const diameter = activeTool === 'eraser' ? size * 6 : sketchStrokeWidth(size, event.pressure || 0.35)
    hover.hidden = false
    hover.style.width = `${Math.max(5, diameter)}px`
    hover.style.height = `${Math.max(5, diameter)}px`
    hover.style.translate = `${event.clientX - rect.left}px ${event.clientY - rect.top}px`
  }

  const appendSamples = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current
    if (!stroke) return
    const rect = event.currentTarget.getBoundingClientRect()
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? []
    const nativeSamples = coalesced.length > 0 ? coalesced : [event.nativeEvent]
    const points = [...stroke.points]
    for (const sample of nativeSamples) {
      const point = sketchPointFromPointer(rect, sample)
      const previous = points.at(-1)
      if (
        !previous ||
        sketchPointDistancePixels(previous, point, rect.width, rect.height) >= 0.55 ||
        Math.abs(previous.pressure - point.pressure) >= 0.06
      ) {
        points.push(point)
      }
    }
    activeStrokeRef.current = { ...stroke, points }
    schedulePaint()
  }

  const eraseAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const next = eraseSketchStrokes(
      strokesRef.current,
      pointerPoint(event),
      size * 3,
      rect.width,
      rect.height,
    )
    if (next.length !== strokesRef.current.length) {
      strokesRef.current = next
      schedulePaint()
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch' && drawingEnabled) {
      // A finger landing while Pencil is drawing is a palm, not a stroke or a
      // widget drag. Two-finger canvas navigation remains available outside
      // the ink surface.
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!shouldStartSketchStroke(event.pointerType, drawingEnabled) || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointerRef.current = event.pointerId
    gestureStartRef.current = strokesRef.current
    document.body.dataset.pencilDrawing = 'true'
    if (hoverRef.current) hoverRef.current.hidden = true
    if (activeTool === 'eraser') {
      eraseAt(event)
      return
    }
    activeStrokeRef.current = {
      id: strokeId(),
      color,
      size,
      points: [pointerPoint(event)],
    }
    appendSamples(event)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    updatePencilHover(event)
    if (activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (activeTool === 'eraser') eraseAt(event)
    else appendSamples(event)
  }

  const finishGesture = (event: ReactPointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    if (activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    activePointerRef.current = null
    delete document.body.dataset.pencilDrawing
    if (cancelled) {
      strokesRef.current = gestureStartRef.current
      activeStrokeRef.current = null
      schedulePaint()
      return
    }
    if (activeTool === 'eraser') {
      if (strokesRef.current !== gestureStartRef.current) commit(strokesRef.current)
      return
    }
    const stroke = activeStrokeRef.current
    if (stroke && stroke.points.length > 0) {
      const rect = event.currentTarget.getBoundingClientRect()
      commit([
        ...strokesRef.current,
        {
          ...stroke,
          points: simplifySketchPoints(stroke.points, rect.width, rect.height),
        },
      ])
    }
  }

  const tools = [
    { id: 'pen' as const, Icon: Pen, label: 'Pen' },
    { id: 'eraser' as const, Icon: Eraser, label: 'Stroke eraser' },
  ]

  return (
    <div className="flex h-full flex-col gap-2" data-sketchpad-focused={drawingEnabled || undefined}>
      <div className="flex shrink-0 flex-wrap items-center gap-1" role="toolbar" aria-label="Sketch tools">
        {tools.map(({ id, Icon, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeTool === id}
            aria-label={label}
            onClick={() => setActiveTool(id)}
            className={`gp-touch-target flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-colors ${
              activeTool === id
                ? 'bg-neutral-700/80 text-neutral-100'
                : 'text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-300'
            }`}
          >
            <Icon size={12} aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
        <span className="mx-0.5 h-5 w-px bg-white/10" aria-hidden />
        {COLORS.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-label={`Ink ${choice}`}
            aria-pressed={color === choice}
            onClick={() => { setColor(choice); setActiveTool('pen') }}
            className="gp-touch-target flex h-8 w-8 items-center justify-center rounded-lg"
          >
            <span
              aria-hidden
              className={`h-3.5 w-3.5 rounded-full ${color === choice ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-neutral-900' : ''}`}
              style={{ backgroundColor: choice }}
            />
          </button>
        ))}
        <select
          aria-label="Ink width"
          value={size}
          onChange={(event) => setSize(Number(event.target.value) as (typeof SIZES)[number])}
          className="gp-touch-target h-8 rounded-lg bg-neutral-800/70 px-2 text-[11px] text-neutral-300"
        >
          {SIZES.map((choice) => <option key={choice} value={choice}>{choice}px</option>)}
        </select>
        <span className="ml-auto flex items-center gap-0.5">
          <button type="button" aria-label="Undo" disabled={!canUndo} onClick={() => useWidgetStore.getState().undo()} className="gp-touch-target flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-800 hover:text-white disabled:opacity-30"><Undo2 size={12} /></button>
          <button type="button" aria-label="Redo" disabled={!canRedo} onClick={() => useWidgetStore.getState().redo()} className="gp-touch-target flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-800 hover:text-white disabled:opacity-30"><Redo2 size={12} /></button>
          <button type="button" aria-label="Clear sketch" disabled={(data.strokes?.length ?? 0) === 0} onClick={() => commit([])} className="gp-touch-target flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-30"><Trash2 size={12} /></button>
        </span>
      </div>
      <div className="gp-sketch-surface relative min-h-0 flex-1 overflow-hidden rounded-xl border gp-hairline bg-neutral-950/35">
        <canvas
          ref={canvasRef}
          data-widget-interactive="true"
          aria-label="Sketch drawing surface"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => finishGesture(event, false)}
          onPointerCancel={(event) => finishGesture(event, true)}
          onLostPointerCapture={(event) => finishGesture(event, true)}
          onPointerLeave={() => { if (hoverRef.current) hoverRef.current.hidden = true }}
          className={`block h-full w-full ${drawingEnabled ? 'touch-none cursor-crosshair' : 'cursor-pointer'}`}
        />
        <div
          ref={hoverRef}
          hidden
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-white/10 shadow-[0_0_12px_rgba(255,255,255,.24)]"
        />
        {!drawingEnabled && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-black/45 px-2 py-1.5 text-center text-[10px] text-neutral-400">
            Focus this Sketchpad to draw; fingers remain reserved for navigation.
          </div>
        )}
      </div>
    </div>
  )
}
