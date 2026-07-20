// ---------------------------------------------------------------------------
// Frame meter — records every animation frame's duration during a bench run
// and evaluates the canvas engine contract's numeric gates. Measurement is
// browser-bound; evaluation is pure and unit-tested.
// ---------------------------------------------------------------------------

export interface FrameReport {
  frames: number
  durationMs: number
  /** Frame deltas in ms, in order. */
  deltasMs: number[]
  meanMs: number
  p95Ms: number
  p99Ms: number
  longestMs: number
  /** Deltas exceeding the 60Hz dropped-frame threshold (25ms = 1.5 frames). */
  droppedAt60: number
  /** Deltas within the 120Hz budget, as a share (informational). */
  within120Share: number
  longTasks: number
  longTaskTotalMs: number
}

export const DROPPED_60_THRESHOLD_MS = 25
export const BUDGET_120_MS = 8.4

export function summarizeFrames(
  deltasMs: readonly number[],
  longTasks: readonly number[],
): FrameReport {
  const sorted = [...deltasMs].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  const total = deltasMs.reduce((sum, d) => sum + d, 0)
  return {
    frames: deltasMs.length,
    durationMs: total,
    deltasMs: [...deltasMs],
    meanMs: deltasMs.length > 0 ? total / deltasMs.length : 0,
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    longestMs: sorted[sorted.length - 1] ?? 0,
    droppedAt60: deltasMs.filter((d) => d > DROPPED_60_THRESHOLD_MS).length,
    within120Share:
      deltasMs.length > 0 ? deltasMs.filter((d) => d <= BUDGET_120_MS).length / deltasMs.length : 1,
    longTasks: longTasks.length,
    longTaskTotalMs: longTasks.reduce((sum, d) => sum + d, 0),
  }
}

export interface GateResult {
  gate: string
  pass: boolean
  detail: string
}

/** Contract gates that the frame data alone can judge (gates 1, 2, 6-adjacent).
 * Loader/memory gates are computed by their own probes and appended. */
export function evaluateFrameGates(report: FrameReport): GateResult[] {
  return [
    {
      gate: 'zero dropped frames @60Hz',
      pass: report.droppedAt60 === 0,
      detail: `${report.droppedAt60} dropped of ${report.frames} (longest ${report.longestMs.toFixed(1)}ms)`,
    },
    {
      gate: '120Hz best-effort (p95 ≤ 8.4ms)',
      pass: report.p95Ms <= BUDGET_120_MS,
      detail: `p95 ${report.p95Ms.toFixed(2)}ms, p99 ${report.p99Ms.toFixed(2)}ms`,
    },
  ]
}

export interface FrameMeter {
  stop: () => { deltasMs: number[]; longTasksMs: number[] }
}

/** Begin recording rAF deltas + long tasks until stop() is called. */
export function startFrameMeter(): FrameMeter {
  const deltasMs: number[] = []
  const longTasksMs: number[] = []
  let last = performance.now()
  let rafId = 0
  const tick = (now: number) => {
    deltasMs.push(now - last)
    last = now
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame((now) => {
    // First callback only anchors the clock; a partial frame is not data.
    last = now
    rafId = requestAnimationFrame(tick)
  })

  let observer: PerformanceObserver | null = null
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasksMs.push(entry.duration)
    })
    observer.observe({ type: 'longtask', buffered: false })
  } catch {
    observer = null // WebKit without longtask support — frame deltas still stand.
  }

  return {
    stop: () => {
      cancelAnimationFrame(rafId)
      observer?.disconnect()
      return { deltasMs, longTasksMs }
    },
  }
}
