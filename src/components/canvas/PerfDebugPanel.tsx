import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardCopy, Gauge } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useCanvasWidgetIds } from '../../hooks/useCanvasWidgets'
import { useToastStore } from '../../store/useToastStore'

const SAMPLE_INTERVAL_MS = 1000

interface PerfSample {
  fps: number
  frameTimeMs: number
  longTasksPerSec: number
  heapUsedMb: number | null
  heapLimitMb: number | null
}

interface TypeBreakdownRow {
  type: string
  count: number
  approxBytes: number
}

/** performance.memory is a non-standard Chrome extension; every other
 * engine leaves it undefined. */
function readHeap(): { usedMb: number | null; limitMb: number | null } {
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }
  }).memory
  if (!memory) return { usedMb: null, limitMb: null }
  return {
    usedMb: memory.usedJSHeapSize / (1024 * 1024),
    limitMb: memory.jsHeapSizeLimit / (1024 * 1024),
  }
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Live board-weight readout, toggled with `P` (same pattern as the AI and
 * scale debuggers). Reports what's actually observable from JS: rendered
 * frame rate and long-task stalls as the CPU/GPU proxy (there is no
 * standard API for real GPU load — DevTools' own Performance/Layers panel
 * is the ground truth for that), performance.memory as a rough JS heap
 * gauge (Chrome-only), and DOM node / board data-size counts as a proxy for
 * what each widget is actually holding onto.
 */
export function PerfDebugPanel() {
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const canvasWidgetIds = useCanvasWidgetIds(activeCanvasId)
  const totalBoardWidgets = useWidgetStore((state) => Object.keys(state.widgets).length)
  const zoom = useCanvasStore((state) => state.zoom)

  const [sample, setSample] = useState<PerfSample>({
    fps: 0,
    frameTimeMs: 0,
    longTasksPerSec: 0,
    heapUsedMb: null,
    heapLimitMb: null,
  })
  const [domNodeCount, setDomNodeCount] = useState(0)

  const frameCountRef = useRef(0)
  const longTaskCountRef = useRef(0)
  const rafFrameStartRef = useRef(0)
  const frameTimeSumRef = useRef(0)

  useEffect(() => {
    let rafId: number
    const onFrame = (t: number) => {
      if (rafFrameStartRef.current) {
        frameTimeSumRef.current += t - rafFrameStartRef.current
        frameCountRef.current += 1
      }
      rafFrameStartRef.current = t
      rafId = requestAnimationFrame(onFrame)
    }
    rafId = requestAnimationFrame(onFrame)

    let longTaskObserver: PerformanceObserver | undefined
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        longTaskCountRef.current += list.getEntries().length
      })
      longTaskObserver.observe({ type: 'longtask', buffered: false })
    } catch {
      // longtask isn't supported everywhere (e.g. Safari) — stalls just
      // won't be counted there, the rest of the panel still works.
    }

    const intervalId = window.setInterval(() => {
      const frames = frameCountRef.current
      const avgFrameTimeMs = frames > 0 ? frameTimeSumRef.current / frames : 0
      const heap = readHeap()
      setSample({
        fps: frames,
        frameTimeMs: avgFrameTimeMs,
        longTasksPerSec: longTaskCountRef.current,
        heapUsedMb: heap.usedMb,
        heapLimitMb: heap.limitMb,
      })
      frameCountRef.current = 0
      frameTimeSumRef.current = 0
      longTaskCountRef.current = 0

      setDomNodeCount(document.querySelectorAll('[data-widget-id] *').length)
    }, SAMPLE_INTERVAL_MS)

    return () => {
      cancelAnimationFrame(rafId)
      longTaskObserver?.disconnect()
      window.clearInterval(intervalId)
    }
  }, [])

  const { totalDataBytes, byType } = useMemo(() => {
    const widgets = useWidgetStore.getState().widgets
    const rows = new Map<string, TypeBreakdownRow>()
    let total = 0
    for (const id of canvasWidgetIds) {
      const widget = widgets[id]
      if (!widget) continue
      const bytes = JSON.stringify(widget).length
      total += bytes
      const row = rows.get(widget.type) ?? { type: widget.type, count: 0, approxBytes: 0 }
      row.count += 1
      row.approxBytes += bytes
      rows.set(widget.type, row)
    }
    return {
      totalDataBytes: total,
      byType: [...rows.values()].sort((a, b) => b.approxBytes - a.approxBytes),
    }
    // Recompute alongside the periodic sample tick, not on every store
    // change — this panel is a diagnostic snapshot, not a live subscriber.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasWidgetIds, sample])

  const copyReport = () => {
    const lines = [
      `# Perf debug report — ${new Date().toLocaleString()}`,
      '',
      `Active canvas: ${canvasWidgetIds.length} widgets mounted (${totalBoardWidgets} total across the whole board)`,
      `DOM nodes under mounted widget cards: ${domNodeCount}`,
      `Board data on this canvas: ${fmtBytes(totalDataBytes)}`,
      `FPS: ${sample.fps}  avg frame time: ${sample.frameTimeMs.toFixed(2)}ms  long tasks/s: ${sample.longTasksPerSec}`,
      sample.heapUsedMb !== null
        ? `JS heap: ${sample.heapUsedMb.toFixed(1)}MB / ${sample.heapLimitMb?.toFixed(0)}MB limit`
        : 'JS heap: unavailable (performance.memory is Chrome-only)',
      `Zoom: ${zoom.toFixed(2)}×`,
      '',
      '## By widget type (this canvas)',
      ...byType.map((row) => `- ${row.type}: ${row.count} widgets, ${fmtBytes(row.approxBytes)}`),
    ]
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => useToastStore.getState().addToast('Perf debug report copied'))
      .catch(() => useToastStore.getState().addToast('Could not copy report'))
  }

  const stalling = sample.longTasksPerSec > 0 || sample.frameTimeMs > 33

  return (
    <div
      data-canvas-ui
      className="gp-popup-surface gp-dialog gp-panel absolute right-4 top-28 z-10 flex w-[560px] max-w-[calc(100vw-2rem)] select-none flex-col overflow-hidden rounded-2xl shadow-xl"
    >
      <div className="flex items-center gap-2.5 border-b gp-hairline px-4 py-3 text-sm text-neutral-400">
        <Gauge size={18} className={stalling ? 'text-amber-400' : 'text-emerald-400'} aria-hidden />
        <span className="font-semibold text-neutral-300">Perf debug</span>
        <span className="ml-auto tabular-nums text-neutral-600">zoom {zoom.toFixed(2)}×</span>
        <button
          type="button"
          aria-label="Copy perf debug report"
          onClick={copyReport}
          className="rounded p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <ClipboardCopy size={16} aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 px-4 py-4 text-sm text-neutral-300">
        <span className="text-neutral-500">FPS</span>
        <span className="text-right tabular-nums text-base">{sample.fps}</span>

        <span className="text-neutral-500">Avg frame time</span>
        <span className="text-right tabular-nums text-base">{sample.frameTimeMs.toFixed(2)} ms</span>

        <span className="text-neutral-500">Long tasks / s</span>
        <span className={`text-right tabular-nums text-base ${sample.longTasksPerSec > 0 ? 'text-amber-400' : ''}`}>
          {sample.longTasksPerSec}
        </span>

        <span className="text-neutral-500">JS heap</span>
        <span className="text-right tabular-nums text-base">
          {sample.heapUsedMb !== null ? `${sample.heapUsedMb.toFixed(1)} / ${sample.heapLimitMb?.toFixed(0)} MB` : 'n/a'}
        </span>

        <span className="text-neutral-500">Widgets on canvas</span>
        <span className="text-right tabular-nums text-base">{canvasWidgetIds.length}</span>

        <span className="text-neutral-500">Widgets on whole board</span>
        <span className="text-right tabular-nums text-base">{totalBoardWidgets}</span>

        <span className="text-neutral-500">DOM nodes (mounted widgets)</span>
        <span className="text-right tabular-nums text-base">{domNodeCount}</span>

        <span className="text-neutral-500">Board data (this canvas)</span>
        <span className="text-right tabular-nums text-base">{fmtBytes(totalDataBytes)}</span>
      </div>

      <div className="border-t gp-hairline px-4 py-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          By widget type, heaviest first
        </div>
        <div className="max-h-64 overflow-y-auto">
          {byType.length === 0 && <div className="py-1 text-sm text-neutral-600">No widgets on this canvas.</div>}
          {byType.map((row) => (
            <div key={row.type} className="flex items-center justify-between py-1 text-sm text-neutral-300">
              <span className="truncate">{row.type}</span>
              <span className="ml-2 shrink-0 tabular-nums text-neutral-500">
                {row.count}× · {fmtBytes(row.approxBytes)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t gp-hairline bg-neutral-950/30 px-4 py-2 text-xs text-neutral-600">
        GPU load isn't readable from JS — use the browser's own Performance/Layers panel alongside this. P to hide.
      </div>
    </div>
  )
}
