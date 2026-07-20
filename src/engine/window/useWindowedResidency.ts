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
/** New mounts allowed per slice while the camera is moving. */
const MOVING_MOUNT_BATCH = 16
/** New mounts allowed per slice at idle (settle backfill). */
const IDLE_MOUNT_BATCH = 64
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

  const compute = (allowUnmount: boolean, mountBatch: number): ResidencyResult => {
    const frame = cameraEngine.getFrame()
    const result = computeResidency({
      entries,
      view: viewportToWorldRect(frame.pan, frame.zoom, cameraEngine.getViewportSize()),
      zoom: frame.zoom,
      panVelocity: cameraEngine.getVelocity().panVelocity,
      pinnedIds,
      previousMounted: previousMounted.current,
      previousFull: previousFull.current,
      allowUnmount,
      mountBatch,
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
    compute(true, MOUNTED_BUDGET),
  )

  useEffect(() => {
    let timer: number | null = null

    /** Recompute once; report whether the mount batch cap was hit. */
    const apply = (): boolean => {
      const idle = cameraEngine.getVelocity().tier === 'idle'
      const batch = idle ? IDLE_MOUNT_BATCH : MOVING_MOUNT_BATCH
      const before = previousMounted.current
      const next = compute(idle, batch)
      let grew = 0
      for (const id of next.mountedIds) {
        if (!before.has(id)) grew++
      }
      setResidency((current) => (sameResidency(current, next) ? current : next))
      return grew >= batch
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
