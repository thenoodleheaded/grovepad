import type { Vector2D } from '../../types/spatial'
import type { WorldRect } from '../../utils/canvasView'

// ---------------------------------------------------------------------------
// Windowed residency (canvas engine contract §2) — pure selection of which
// widgets exist in the DOM and at which tier, from the camera window.
//
// Tiers:
//   full      — live interactive WidgetCard. Near the viewport, big enough on
//               screen to read, budget-capped by distance; pins always full.
//   primitive — cheap passive card (PrimitiveWidgetCard). Everything else
//               inside the mount ring, budget-capped.
//   (absent)  — beyond the ring: no DOM at all.
//
// Motion rules: the enter ring stretches in the direction of camera travel
// (pre-mount ahead of the user); a resident widget only unmounts once it is
// beyond the larger exit ring AND the caller says unmounting is allowed
// (idle). Mid-gesture the set can only grow, capped per flush — so a pan
// never pays teardown costs, and quality changes stay off the hot frames.
// ---------------------------------------------------------------------------

export interface ResidencyEntry {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ResidencyInput {
  entries: readonly ResidencyEntry[]
  /** Visible world rect (already overscanned/quantized upstream). */
  view: WorldRect
  zoom: number
  /** Screen-space pan velocity px/s — the ring stretches opposite to it. */
  panVelocity: Vector2D
  pinnedIds: ReadonlySet<string>
  previousMounted: ReadonlySet<string>
  previousFull: ReadonlySet<string>
  /** True only when the camera is idle — the only time teardown may happen. */
  allowUnmount: boolean
  /** True only when the camera is idle: promoting a primitive to a full glass
   * card (or demoting one) is the single most expensive mount event, so tier
   * membership is frozen mid-motion — only pins may still promote. */
  allowTierChange: boolean
  /** Max NEW mounts this pass (keeps a single flush bounded mid-gesture). */
  mountBatch: number
  /** Max NEW full-tier promotions this pass. A full glass card is the most
   * expensive thing this layer can mount; even the settle backfill staggers
   * them so no single commit builds dozens of editors at once. */
  promoteBatch: number
  fullBudget: number
  mountedBudget: number
}

export interface ResidencyResult {
  /** Stable id-sorted list of every widget that should have DOM. */
  mountedIds: string[]
  /** Subset rendered as full interactive cards. */
  fullIds: Set<string>
}

/** On-screen width (px) below which a card cannot present a usable editor —
 * it renders as a primitive even when near, until the user zooms in. */
export const FULL_TIER_MIN_SCREEN_WIDTH = 150

/** A card that is already full stays full down to this fraction of the entry
 * threshold, so zoom jitter at the boundary never flips tiers every frame. */
export const FULL_TIER_EXIT_RATIO = 0.85

/** Enter ring: half a viewport of margin all around… */
const ENTER_MARGIN_VIEWPORTS = 0.5
/** …stretched up to this many extra viewports in the travel direction. */
const FORWARD_STRETCH_VIEWPORTS = 1.5
/** Velocity (screen px/s) at which the forward stretch saturates. */
const STRETCH_SATURATION_SPEED = 2400
/** Exit ring multiplier — hysteresis so residency never flaps at an edge. */
const EXIT_MARGIN_SCALE = 2.2

function inflatedView(input: ResidencyInput, scale: number): WorldRect {
  const { view, zoom, panVelocity } = input
  const marginX = (view.width * ENTER_MARGIN_VIEWPORTS) * scale
  const marginY = (view.height * ENTER_MARGIN_VIEWPORTS) * scale
  // World travel direction is opposite the pan velocity, in world units.
  const speed = Math.hypot(panVelocity.x, panVelocity.y)
  const stretch = Math.min(1, speed / STRETCH_SATURATION_SPEED)
  const worldVx = speed > 0 ? (-panVelocity.x / zoom / Math.max(1, speed)) * speed : 0
  const worldVy = speed > 0 ? (-panVelocity.y / zoom / Math.max(1, speed)) * speed : 0
  const forwardX = Math.sign(worldVx) * stretch * view.width * FORWARD_STRETCH_VIEWPORTS * scale
  const forwardY = Math.sign(worldVy) * stretch * view.height * FORWARD_STRETCH_VIEWPORTS * scale
  return {
    x: view.x - marginX + Math.min(0, forwardX),
    y: view.y - marginY + Math.min(0, forwardY),
    width: view.width + marginX * 2 + Math.abs(forwardX),
    height: view.height + marginY * 2 + Math.abs(forwardY),
  }
}

function intersects(entry: ResidencyEntry, rect: WorldRect): boolean {
  return (
    entry.x < rect.x + rect.width &&
    entry.x + entry.width > rect.x &&
    entry.y < rect.y + rect.height &&
    entry.y + entry.height > rect.y
  )
}

function centerDistance(entry: ResidencyEntry, view: WorldRect): number {
  const cx = view.x + view.width / 2
  const cy = view.y + view.height / 2
  return Math.hypot(entry.x + entry.width / 2 - cx, entry.y + entry.height / 2 - cy)
}

export function computeResidency(input: ResidencyInput): ResidencyResult {
  const enterRing = inflatedView(input, 1)
  const exitRing = inflatedView(input, EXIT_MARGIN_SCALE)

  const candidates: Array<{ entry: ResidencyEntry; distance: number; kept: boolean }> = []
  for (const entry of input.entries) {
    const pinned = input.pinnedIds.has(entry.id)
    const wasMounted = input.previousMounted.has(entry.id)
    const inEnter = intersects(entry, enterRing)
    const keptByHysteresis = wasMounted && (!input.allowUnmount || intersects(entry, exitRing))
    if (!pinned && !inEnter && !keptByHysteresis) continue
    candidates.push({ entry, distance: centerDistance(entry, input.view), kept: pinned || wasMounted })
  }

  // Budget by viewport-center distance; already-resident widgets and pins win
  // ties so the set is maximally stable frame to frame.
  candidates.sort((a, b) => Number(b.kept) - Number(a.kept) || a.distance - b.distance)

  let newMounts = 0
  const mounted: string[] = []
  const mountedSet = new Set<string>()
  for (const candidate of candidates) {
    if (mounted.length >= input.mountedBudget) break
    if (!candidate.kept) {
      if (newMounts >= input.mountBatch) continue
      newMounts++
    }
    mounted.push(candidate.entry.id)
    mountedSet.add(candidate.entry.id)
  }
  mounted.sort()

  // Full tier: pins first, then nearest readable cards up to the budget.
  const fullIds = new Set<string>()
  for (const id of input.pinnedIds) if (mountedSet.has(id)) fullIds.add(id)

  // Mid-motion the tier is frozen: existing full cards stay full (their mount
  // cost is already paid), nothing else promotes, and the readability sort is
  // skipped entirely. Promotions and demotions land on the settle slice.
  if (!input.allowTierChange) {
    for (const id of input.previousFull) if (mountedSet.has(id)) fullIds.add(id)
    return { mountedIds: mounted, fullIds }
  }

  // The readability gate rations a SCARCE full-card budget toward cards big
  // enough on screen to be worth a live editor. With no scarcity — the whole
  // candidate set fits the budget — appearance wins: every card stays a full
  // card at any zoom, exactly like a small board always rendered.
  const scarce = candidates.length > input.fullBudget
  const readable = candidates
    .filter((candidate) => {
      if (fullIds.has(candidate.entry.id) || !mountedSet.has(candidate.entry.id)) return false
      if (!intersects(candidate.entry, enterRing)) return false
      if (!scarce) return true
      const wasFull = input.previousFull.has(candidate.entry.id)
      const minWidth = FULL_TIER_MIN_SCREEN_WIDTH * (wasFull ? FULL_TIER_EXIT_RATIO : 1)
      return candidate.entry.width * input.zoom >= minWidth
    })
    .sort(
      (a, b) =>
        Number(input.previousFull.has(b.entry.id)) - Number(input.previousFull.has(a.entry.id)) ||
        a.distance - b.distance,
    )
  let promotions = 0
  for (const candidate of readable) {
    if (fullIds.size >= input.fullBudget) break
    if (!input.previousFull.has(candidate.entry.id)) {
      if (promotions >= input.promoteBatch) continue
      promotions++
    }
    fullIds.add(candidate.entry.id)
  }

  return { mountedIds: mounted, fullIds }
}
