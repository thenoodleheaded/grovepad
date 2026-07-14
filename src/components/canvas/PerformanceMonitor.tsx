import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'

interface FrameStats {
  fps: number
  frames: number
  /** Average frame time across the sample window (ms). Includes JS + GPU compositing. */
  avgMs: number
  /** Worst single frame time in the sample window (ms). Shows hitches. */
  worstMs: number
  /** JS heap usage in MB. 0 when performance.memory is unavailable. */
  heapMB: number
}

const SAMPLE_INTERVAL = 500
const TARGET_MS = 1000 / 120  // 8.33ms — one frame at 120fps

// performance.memory is Chromium-only and non-standard.
type PerfWithMemory = Performance & { memory: { usedJSHeapSize: number } }
const hasMemory = 'memory' in performance

function fpsTone(fps: number): string {
  if (fps >= 110) return 'text-emerald-400'
  if (fps >= 80) return 'text-amber-400'
  return 'text-red-400'
}

/** Frame-time color: green when well under budget, amber when close, red when over. */
function msTone(ms: number): string {
  if (ms < TARGET_MS * 0.7) return 'text-emerald-400'
  if (ms < TARGET_MS) return 'text-amber-400'
  return 'text-red-400'
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

/**
 * FPS / frame-time / heap overlay, toggled with `P`.
 *
 * Frame time (avg + worst) is the best browser-accessible proxy for combined
 * CPU + GPU load — it captures JS work, layout, paint, and compositor time.
 * A healthy 120fps canvas sits around 8ms avg; hitches show as worst-frame
 * spikes. JS heap (Chromium only) indicates memory pressure.
 */
export function PerformanceMonitor() {
  const [visible, setVisible] = useState(false)
  const [stats, setStats] = useState<FrameStats>({
    fps: 0, frames: 0, avgMs: 0, worstMs: 0, heapMB: 0,
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'p') return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isEditableTarget(event.target)) return
      setVisible((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!visible) return

    let rafId = 0
    let framesInSample = 0
    let totalFrames = 0
    let sampleStart = performance.now()
    let prevTime = performance.now()
    let worstMs = 0

    const tick = (now: number) => {
      const frameMs = now - prevTime
      prevTime = now
      if (frameMs > worstMs) worstMs = frameMs

      framesInSample += 1
      totalFrames += 1
      const elapsed = now - sampleStart

      if (elapsed >= SAMPLE_INTERVAL) {
        const fps = Math.round((framesInSample * 1000) / elapsed)
        const avgMs = elapsed / framesInSample
        const heapMB = hasMemory
          ? Math.round((performance as PerfWithMemory).memory.usedJSHeapSize / (1024 * 1024))
          : 0

        setStats({ fps, frames: totalFrames, avgMs, worstMs, heapMB })

        framesInSample = 0
        worstMs = 0
        sampleStart = now
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [visible])

  if (!visible) return null

  const { fps, frames, avgMs, worstMs, heapMB } = stats

  return (
    <div
      data-canvas-ui
      className="gp-toolbar gp-panel absolute right-4 top-16 z-10 flex select-none items-center gap-3 rounded-xl px-3 py-2 font-mono text-xs text-neutral-400 shadow-xl"
    >
      <Activity size={13} className={fpsTone(fps)} aria-hidden />

      {/* FPS */}
      <span>
        <span className={`font-semibold tabular-nums ${fpsTone(fps)}`}>{fps}</span>
        {' '}fps
      </span>

      <span className="h-3 w-px bg-neutral-600" aria-hidden />

      {/* Frame time — avg / worst. Both capture JS + GPU work. */}
      <span title="avg / worst frame time (CPU + GPU)">
        <span className={`tabular-nums ${msTone(avgMs)}`}>{avgMs.toFixed(1)}</span>
        <span className="text-neutral-600"> / </span>
        <span className={`tabular-nums ${msTone(worstMs)}`}>{worstMs.toFixed(1)}</span>
        {' '}ms
      </span>

      {/* JS heap — Chromium only */}
      {heapMB > 0 && (
        <>
          <span className="h-3 w-px bg-neutral-600" aria-hidden />
          <span title="JS heap usage">
            <span className="tabular-nums text-neutral-300">{heapMB}</span>
            {' '}MB
          </span>
        </>
      )}

      <span className="h-3 w-px bg-neutral-600" aria-hidden />
      <span className="tabular-nums">{frames.toLocaleString()} fr</span>
      <span className="text-neutral-600">P to hide</span>
    </div>
  )
}
