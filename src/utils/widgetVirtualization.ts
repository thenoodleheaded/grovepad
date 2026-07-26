import type { Size, Vector2D, Widget } from '../types/spatial'
import {
  isWidgetRestExpanded,
  isWidgetResting,
  restExpansionOffset,
  restingTileSize,
  type WidgetRestContext,
} from './widgetRest'

/** Resting content is too small to aim at reliably below this scale. */
export const RESTING_FACE_INTERACTION_ZOOM = 0.6

/** Camera movement can consume this screen-space gutter without remounting. */
export const WIDGET_WINDOW_OVERSCAN_PX = 320

/** Rebuild the virtual window before the visible viewport reaches its edge. */
export const WIDGET_WINDOW_REPLAN_PX = 72

/** Small commits keep hydration from becoming one long main-thread task. */
export const WIDGET_HYDRATE_BATCH = 8
export const WIDGET_RELEASE_BATCH = 24
export const WIDGET_PREVIEW_BATCH = 64
export const WIDGET_PREVIEW_RELEASE_BATCH = 128

export interface WorldRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CameraViewport {
  pan: Vector2D
  zoom: number
  viewportSize: Size
}

export function worldRectForViewport(
  camera: CameraViewport,
  screenPadding = 0,
): WorldRect {
  const zoom = camera.zoom > 0 ? camera.zoom : 1
  return {
    x: (-camera.pan.x - screenPadding) / zoom,
    y: (-camera.pan.y - screenPadding) / zoom,
    width: (camera.viewportSize.width + screenPadding * 2) / zoom,
    height: (camera.viewportSize.height + screenPadding * 2) / zoom,
  }
}

export function rectContains(outer: WorldRect, inner: WorldRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export function rectsIntersect(a: WorldRect, b: WorldRect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  )
}

/** The box the user can currently see, including an ephemeral rest expansion. */
export function displayedWidgetRect(
  widget: Widget,
  restContext: WidgetRestContext,
): WorldRect {
  const resting = isWidgetResting(widget, restContext)
  const size = resting ? restingTileSize(widget) : widget.size
  const offset = isWidgetRestExpanded(widget, restContext)
    ? restExpansionOffset(widget, restContext)
    : { x: 0, y: 0 }
  return {
    x: widget.position.x + offset.x,
    y: widget.position.y + offset.y,
    width: size.width,
    height: size.height,
  }
}

export interface VirtualWidgetCandidate {
  id: string
  resting: boolean
  distanceSquared: number
}

/**
 * Keeps the nearest cheap previews in the very first canvas paint while the
 * progressive resident set catches up during idle time.
 */
export function withEagerPreviewBatch(
  residentIds: ReadonlySet<string>,
  candidateIds: readonly string[],
  batchSize = WIDGET_PREVIEW_BATCH,
): string[] {
  const ids = [...residentIds]
  const seen = new Set(ids)
  let added = 0
  for (const id of candidateIds) {
    if (seen.has(id)) continue
    ids.push(id)
    seen.add(id)
    added += 1
    if (added >= batchSize) break
  }
  return ids
}

/**
 * Finds only the widgets inside the retained camera window and orders them
 * centre-first, so previews near the user's attention hydrate before the rim.
 */
export function virtualWidgetCandidates(
  widgetIds: readonly string[],
  widgets: Record<string, Widget>,
  windowRect: WorldRect,
  restContext: WidgetRestContext,
): VirtualWidgetCandidate[] {
  const centreX = windowRect.x + windowRect.width / 2
  const centreY = windowRect.y + windowRect.height / 2
  const candidates: VirtualWidgetCandidate[] = []

  for (const id of widgetIds) {
    const widget = widgets[id]
    if (!widget) continue
    const rect = displayedWidgetRect(widget, restContext)
    if (!rectsIntersect(rect, windowRect)) continue
    const dx = rect.x + rect.width / 2 - centreX
    const dy = rect.y + rect.height / 2 - centreY
    candidates.push({
      id,
      resting: isWidgetResting(widget, restContext),
      distanceSquared: dx * dx + dy * dy,
    })
  }

  return candidates.sort((a, b) => a.distanceSquared - b.distanceSquared)
}

export function usesLightweightWidgetImage(
  zoom: number,
  urgent: boolean,
): boolean {
  return !urgent && zoom < RESTING_FACE_INTERACTION_ZOOM
}

export interface ProgressiveMountStep {
  liveIds: ReadonlySet<string>
  settled: boolean
}

/**
 * One deterministic hydration/release slice. Urgent widgets (selection,
 * expansion, keyboard focus) bypass the ordinary load budget.
 */
export function nextProgressiveMountStep(
  current: ReadonlySet<string>,
  targetIds: readonly string[],
  urgentIds: readonly string[],
  hydrateBatch = WIDGET_HYDRATE_BATCH,
  releaseBatch = WIDGET_RELEASE_BATCH,
): ProgressiveMountStep {
  const target = new Set(targetIds)
  const next = new Set(current)
  let released = 0
  for (const id of current) {
    if (target.has(id)) continue
    next.delete(id)
    released += 1
    if (released >= releaseBatch) break
  }

  for (const id of urgentIds) {
    if (target.has(id)) next.add(id)
  }

  let hydrated = 0
  for (const id of targetIds) {
    if (next.has(id)) continue
    next.add(id)
    hydrated += 1
    if (hydrated >= hydrateBatch) break
  }

  const settled =
    next.size === target.size &&
    [...next].every((id) => target.has(id))
  return { liveIds: next, settled }
}
