import { initCircuitEngine } from '../engine/circuitEngine'
import { initWidgetModulePrefetch } from '../engine/loader/idlePrefetch'
import { isBenchMode } from '../bench/benchMode'
import { useCanvasStore } from '../store/useCanvasStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { initPersistence } from '../utils/persistence'
import { initDeployVersionMonitor } from './deployVersionMonitor'
import { initNativeFileOpen } from './nativeFileOpen'
import { initNativeNoteWidgetSync } from './nativeNoteWidgetSync'
import { initNetworkStatusRuntime, registerProductionOfflineShell } from './networkStatusRuntime'
import { useAuthStore } from '../store/useAuthStore'
import { useCollaborationStore } from '../store/useCollaborationStore'

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

function initSignedInCollaboration(): () => void {
  if (!useAuthStore.getState().session) return () => {}
  let cancelled = false
  let dispose: (() => void) | null = null
  void import('./collaborationRuntime')
    .then(({ initCollaborationRuntime }) => {
      if (!cancelled) dispose = initCollaborationRuntime()
    })
    .catch((error: unknown) => {
      if (!cancelled) useCollaborationStore.setState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    })
  return () => {
    cancelled = true
    dispose?.()
  }
}

const appRuntime = createRuntimeBoundary(() => [
  // Bench mode runs on a synthetic 2,000-widget board that must never be
  // written into real storage; everything else about the app stays live.
  isBenchMode() ? () => {} : initPersistence(useWidgetStore, useCanvasStore),
  initWidgetModulePrefetch(),
  initDeployVersionMonitor(),
  initCircuitEngine(),
  initNativeFileOpen(),
  initNativeNoteWidgetSync(),
  initNetworkStatusRuntime({
    registerServiceWorker: import.meta.env.PROD && 'serviceWorker' in navigator
      ? registerProductionOfflineShell
      : undefined,
  }),
  initSignedInCollaboration(),
])

/** Start the canvas-owned services once and return their explicit teardown. */
export function startAppRuntime(): () => void {
  return appRuntime.start()
}
