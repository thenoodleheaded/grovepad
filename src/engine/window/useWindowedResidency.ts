import { useEffect, useRef, useState } from 'react'
import { cameraEngine, subscribeCameraMotion } from '../camera/cameraEngine'
import { useCanvasStore } from '../../store/useCanvasStore'
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
 * time pays no React commits at all — only pins may still mount. Sized so a
 * single backfill commit stays affordable even at 4x CPU throttle. */
const IDLE_MOUNT_BATCH = 48
/** During SLOW ('moving') motion the mount RING is frozen (no new mounts, no
 * teardown) — growing it while panning a huge board balloons residency to
 * hundreds of cards and tanks the frame budget. But cards already mounted in
 * the ring's forward margin (pre-mounted ahead of travel at the last settle)
 * may PROMOTE to full as the pan brings them into view, so a deliberate pan
 * navigates over real faces without any new mount cost. 'fast' motion freezes
 * promotion too (nothing legible mid-fling). */
const MOVING_MOUNT_BATCH = 0
const MOVING_PROMOTE_BATCH = 6
/** Full-card promotions per idle slice, on slices where primitive backfill
 * has gone quiet (glass mounts never share a commit with a mount batch). The
 * count of on-screen READABLE widgets is bounded by screen space (~20-30 fit
 * at readable size), so this restores every visible real face within one or
 * two slices of settling — the old value of 2 left widgets showing the
 * generic primitive face for ~1s after every pan/zoom, which read as "faces
 * revert to generic all the time." A glass card's first backdrop-filter
 * paint is the priciest raster event left, so it is still capped and staged,
 * just far less timidly. */
const IDLE_PROMOTE_BATCH = 12
const RECOMPUTE_INTERVAL_MS = 55

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
  // Data plane lives in refs, not effect closures: hydration can land between
  // this component's first render and its effects (or replace the board while
  // a slice timer is pending), and a slice computed from a stale closure
  // would mount against a dead board. Every slice reads the refs, so every
  // wake-up path — camera frames, settle, entry changes — is self-healing.
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const pinsRef = useRef(pinnedIds)
  pinsRef.current = pinnedIds

  interface SliceOptions {
    allowUnmount: boolean
    allowPromote: boolean
    preserveFull: boolean
    mountBatch: number
    promoteBatch: number
  }

  const compute = (opts: SliceOptions): ResidencyResult => {
    const frame = cameraEngine.getFrame()
    const result = computeResidency({
      entries: entriesRef.current,
      view: viewportToWorldRect(frame.pan, frame.zoom, cameraEngine.getViewportSize()),
      zoom: frame.zoom,
      panVelocity: cameraEngine.getVelocity().panVelocity,
      pinnedIds: pinsRef.current,
      previousMounted: previousMounted.current,
      previousFull: previousFull.current,
      allowUnmount: opts.allowUnmount,
      allowPromote: opts.allowPromote,
      preserveFull: opts.preserveFull,
      mountBatch: opts.mountBatch,
      promoteBatch: opts.promoteBatch,
      fullBudget: FULL_BUDGET,
      mountedBudget: MOUNTED_BUDGET,
    })
    previousMounted.current = new Set(result.mountedIds)
    previousFull.current = result.fullIds
    return result
  }

  // Cold open mounts the whole window at once — board-open cost, not a
  // gesture cost — so the first paint already has every nearby card, full.
  const [residency, setResidency] = useState<ResidencyResult>(() =>
    compute({
      allowUnmount: true,
      allowPromote: true,
      preserveFull: false,
      mountBatch: MOUNTED_BUDGET,
      promoteBatch: FULL_BUDGET,
    }),
  )

  useEffect(() => {
    let timer: number | null = null
    // Two-phase idle settle: the first slice after motion is mounts-only, so a
    // heavy 48-card mount commit never shares a frame with glass promotions.
    let lastSliceGrew = true

    /** Recompute once; report whether more backfill slices are still needed. */
    const apply = (): boolean => {
      const tier = cameraEngine.getVelocity().tier
      const before = previousMounted.current
      const beforeFull = previousFull.current

      let opts: SliceOptions
      if (tier === 'idle') {
        // At rest: full reconcile — teardown, demotion, and generous
        // mount/promote batches. Promotions hold off the slice right after a
        // mount-growth slice (the bridge) to keep the two heavy commits apart.
        opts = {
          allowUnmount: true,
          allowPromote: true,
          preserveFull: false,
          mountBatch: IDLE_MOUNT_BATCH,
          promoteBatch: lastSliceGrew ? 0 : IDLE_PROMOTE_BATCH,
        }
      } else if (tier === 'fast') {
        // Fast fling: freeze. Nothing legible; glass mounts would cost frames.
        opts = { allowUnmount: false, allowPromote: false, preserveFull: true, mountBatch: 0, promoteBatch: 0 }
      } else {
        // Slow ('moving') pan: grow only — mount and promote a few entering
        // cards per slice so a deliberate navigation shows real faces, never
        // demote (preserveFull), never tear down (allowUnmount false).
        opts = {
          allowUnmount: false,
          allowPromote: true,
          preserveFull: true,
          mountBatch: MOVING_MOUNT_BATCH,
          promoteBatch: MOVING_PROMOTE_BATCH,
        }
      }

      const next = compute(opts)
      let grew = 0
      for (const id of next.mountedIds) {
        if (!before.has(id)) grew++
      }
      let promoted = 0
      for (const id of next.fullIds) {
        if (!beforeFull.has(id)) promoted++
      }
      // Motion slices count as "growth pending" so the first idle slice after
      // motion is always mounts-only (the bridge before promotions begin).
      lastSliceGrew = tier === 'idle' ? grew > 0 : true
      setResidency((current) => (sameResidency(current, next) ? current : next))
      // Keep backfilling while work is still flowing, or to cross the bridge
      // slice into the idle promotion phase.
      return grew > 0 || promoted > 0 || (tier === 'idle' && opts.promoteBatch === 0)
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
    // Viewport size can arrive late (hidden tab, minimized launch, pane
    // boot): the ring math depends on it, so its arrival is a wake-up.
    const offViewport = useCanvasStore.subscribe((state, previous) => {
      if (state.viewportSize !== previous.viewportSize) schedule()
    })
    // Entries or pins changed (board edit, drag settle): refresh membership.
    if (apply()) schedule()
    return () => {
      offFrame()
      offMotion()
      offViewport()
      if (timer !== null) window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compute reads only entries/pinnedIds
  }, [entries, pinnedIds])

  return residency
}
