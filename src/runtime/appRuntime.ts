import { initCircuitEngine } from '../engine/circuitEngine'
import { useCanvasStore } from '../store/useCanvasStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { initPersistence } from '../utils/persistence'

/** Combine service disposers into one idempotent application boundary. */
export function composeRuntimeDisposer(disposers: readonly (() => void)[]): () => void {
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    for (const dispose of [...disposers].reverse()) dispose()
  }
}

export function createRuntimeBoundary(startServices: () => readonly (() => void)[]) {
  let activeDispose: (() => void) | null = null
  return {
    start(): () => void {
      if (activeDispose) return activeDispose
      const disposeServices = composeRuntimeDisposer(startServices())
      let closed = false
      const dispose = () => {
        if (closed) return
        closed = true
        disposeServices()
        if (activeDispose === dispose) activeDispose = null
      }
      activeDispose = dispose
      return dispose
    },
  }
}

const appRuntime = createRuntimeBoundary(() => [
  initPersistence(useWidgetStore, useCanvasStore),
  initCircuitEngine(),
])

/** Start the canvas-owned services once and return their explicit teardown. */
export function startAppRuntime(): () => void {
  return appRuntime.start()
}
