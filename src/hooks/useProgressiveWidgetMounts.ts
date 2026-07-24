import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { nextProgressiveMountStep } from '../utils/widgetVirtualization'

interface IdleDeadlineLike {
  timeRemaining: () => number
}

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadlineLike) => void,
    options?: { timeout: number },
  ) => number
  cancelIdleCallback?: (handle: number) => void
}

function scheduleIdle(callback: (deadline: IdleDeadlineLike) => void): () => void {
  const idleWindow = window as IdleWindow
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 120 })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }
  const handle = window.setTimeout(
    () => callback({ timeRemaining: () => 8 }),
    24,
  )
  return () => window.clearTimeout(handle)
}

/**
 * Keeps expensive WidgetCard mounts out of one giant React commit. The cheap
 * image layer appears first; cards then hydrate centre-first during idle time.
 */
export function useProgressiveWidgetMounts(
  targetIds: readonly string[],
  urgentIds: readonly string[],
  options: {
    hydrateBatch?: number
    releaseBatch?: number
  } = {},
): {
  liveIds: ReadonlySet<string>
  mountNow: (widgetId: string) => void
} {
  const [liveIds, setLiveIds] = useState<ReadonlySet<string>>(() => new Set())
  const liveRef = useRef(liveIds)
  liveRef.current = liveIds

  useEffect(() => {
    let cancelled = false
    let cancelScheduled: (() => void) | undefined

    // Selection and expansion are explicit requests, so they never wait for
    // the idle scheduler behind ordinary centre-out hydration.
    const target = new Set(targetIds)
    const immediate = new Set(liveRef.current)
    let hasImmediateChange = false
    for (const id of urgentIds) {
      if (!target.has(id) || immediate.has(id)) continue
      immediate.add(id)
      hasImmediateChange = true
    }
    if (hasImmediateChange) {
      liveRef.current = immediate
      setLiveIds(immediate)
    }

    const advance = () => {
      if (cancelled) return
      const step = nextProgressiveMountStep(
        liveRef.current,
        targetIds,
        urgentIds,
        options.hydrateBatch,
        options.releaseBatch,
      )
      if (step.liveIds !== liveRef.current) {
        liveRef.current = step.liveIds
        startTransition(() => setLiveIds(step.liveIds))
      }
      if (!step.settled) {
        cancelScheduled = scheduleIdle(() => advance())
      }
    }

    cancelScheduled = scheduleIdle(() => advance())
    return () => {
      cancelled = true
      cancelScheduled?.()
    }
  }, [options.hydrateBatch, options.releaseBatch, targetIds, urgentIds])

  const mountNow = useCallback((widgetId: string) => {
    if (liveRef.current.has(widgetId)) return
    const next = new Set(liveRef.current)
    next.add(widgetId)
    liveRef.current = next
    setLiveIds(next)
  }, [])

  return { liveIds, mountNow }
}
