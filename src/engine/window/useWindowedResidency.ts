import { useEffect, useRef, useState } from 'react'
import { cameraEngine, subscribeCameraMotion } from '../camera/cameraEngine'
import { viewportToWorldRect } from '../../utils/canvasView'
import { computeResidency, type ResidencyEntry, type ResidencyResult } from './windowedResidency'

// ---------------------------------------------------------------------------
// Residency driver (canvas engine contract §2). Bridges camera frames to the
// pure windowing math without ever running inside a gesture frame: frame
// listeners only mark the window dirty; the recompute runs in a coalesced
// timeout slice. Mid-motion passes may only grow the mounted set (bounded per
// slice); teardown waits for the camera to settle to idle.
// ---------------------------------------------------------------------------

const MOUNTED_BUDGET = 320
const FULL_BUDGET = 32
/** New mounts allowed per slice at idle (settle backfill). Mid-motion the
 * batch is ZERO: the sprite underlay covers everything unmounted, so gesture
 * time pays no React commits at all — only pins may still mount. */
const IDLE_MOUNT_BATCH = 64
/** Full-card promotions per idle slice — glass mounts are staggered so the
 * settle re-crisp never builds dozens of editors in one commit. */
const IDLE_PROMOTE_BATCH = 4
const RECOMPUTE_INTERVAL_MS = 90

function sameResidency(a: ResidencyResult, b: ResidencyResult): boolean {
  if (a.mountedIds.length !== b.mountedIds.length || a.fullIds.size !== b.fullIds.size) return false
  for (let i = 0; i < a.mountedIds.length; i++) {
    if (a.mountedIds[i] !== b.mountedIds[i]) return false
  }
  for (const id of a.fullIds) {
    if (!b.fullIds.has(id)) return false
  }
  return true
}

export function useWindowedResidency(
  entries: readonly ResidencyEntry[],
  pinnedIds: ReadonlySet<string>,
): ResidencyResult {
  const previousMounted = useRef<ReadonlySet<string>>(new Set())
  const previousFull = useRef<ReadonlySet<string>>(new Set())

  const compute = (idle: boolean, mountBatch: number, promoteBatch: number): ResidencyResult => {
    const frame = cameraEngine.getFrame()
    const result = computeResidency({
      entries,
      view: viewportToWorldRect(frame.pan, frame.zoom, cameraEngine.getViewportSize()),
      zoom: frame.zoom,
      panVelocity: cameraEngine.getVelocity().panVelocity,
      pinnedIds,
      previousMounted: previousMounted.current,
      previousFull: previousFull.current,
      allowUnmount: idle,
      allowTierChange: idle,
      mountBatch,
      promoteBatch,
      fullBudget: FULL_BUDGET,
      mountedBudget: MOUNTED_BUDGET,
    })
    previousMounted.current = new Set(result.mountedIds)
    previousFull.current = result.fullIds
    return result
  }

  // Cold open mounts the whole window at once — board-open cost, not a
  // gesture cost — so the first paint already has every nearby card.
  const [residency, setResidency] = useState<ResidencyResult>(() =>
    compute(true, MOUNTED_BUDGET, FULL_BUDGET),
  )

  useEffect(() => {
    let timer: number | null = null

    /** Recompute once; report whether a batch cap was hit (needs more slices). */
    const apply = (): boolean => {
      const idle = cameraEngine.getVelocity().tier === 'idle'
      const batch = idle ? IDLE_MOUNT_BATCH : 0
      const before = previousMounted.current
      const beforeFull = previousFull.current
      const next = compute(idle, batch, idle ? IDLE_PROMOTE_BATCH : 0)
      let grew = 0
      for (const id of next.mountedIds) {
        if (!before.has(id)) grew++
      }
      let promoted = 0
      for (const id of next.fullIds) {
        if (!beforeFull.has(id)) promoted++
      }
      setResidency((current) => (sameResidency(current, next) ? current : next))
      return (batch > 0 && grew >= batch) || (idle && promoted >= IDLE_PROMOTE_BATCH)
    }

    const schedule = (): void => {
      if (timer !== null) return
      timer = window.setTimeout(() => {
        timer = null
        // Batch cap hit — keep backfilling on later slices until stable.
        if (apply()) schedule()
      }, RECOMPUTE_INTERVAL_MS)
    }

    const offFrame = cameraEngine.onFrame(schedule)
    const offMotion = subscribeCameraMotion((active) => {
      if (!active) schedule()
    })
    // Entries or pins changed (board edit, drag settle): refresh membership.
    if (apply()) schedule()
    return () => {
      offFrame()
      offMotion()
      if (timer !== null) window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compute reads only entries/pinnedIds
  }, [entries, pinnedIds])

  return residency
}
