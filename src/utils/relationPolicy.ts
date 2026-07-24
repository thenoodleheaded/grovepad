import type { CanvasMeta, RelationType, Widget } from '../types/spatial'

export type RelationEndpoint = 'from' | 'to'
export type RelationAnchorRegion = 'any' | 'upper' | 'lower'

/** Canvas-wide strictness was removed. Keep this compatibility seam while old
 * boards may still carry `relationStrict`; every canvas is free-form now. */
export function usesStrictRelations(_canvas: CanvasMeta | undefined): boolean {
  return false
}

/** A strict drag assigns parenthood by vertical placement. A free drag keeps
 * the direction the user drew and applies no parent/child interpretation. */
export function relationDropEndpoints(
  source: Widget,
  target: Widget,
  strict: boolean,
): readonly [fromId: string, toId: string] {
  if (!strict) return [source.id, target.id]
  const sourceCenterY = source.position.y + source.size.height / 2
  const targetCenterY = target.position.y + target.size.height / 2
  return sourceCenterY <= targetCenterY
    ? [source.id, target.id]
    : [target.id, source.id]
}

interface RelationGeometryEndpoint {
  center: { y: number }
}

interface RelationBoxEndpoint extends RelationGeometryEndpoint {
  halfH: number
}

/**
 * Strict paint always flows from the visually upper endpoint to the lower
 * one. Free canvases may have persisted the opposite direction, so the
 * renderer must not feed that stale order into downward-only curve geometry.
 */
export function strictParentGeometryOrder<T extends RelationGeometryEndpoint>(
  from: T,
  to: T,
): readonly [parent: T, child: T] {
  return from.center.y <= to.center.y ? [from, to] : [to, from]
}

/** Whether strict bottom→top rails have real clear air between the two boxes.
 * Overlapping rows temporarily fall back to nearest-border paint so a line
 * cannot double back through the widgets and look severed. */
export function strictParentHasVerticalCorridor(
  parent: RelationBoxEndpoint,
  child: RelationBoxEndpoint,
  standoff: number,
): boolean {
  const startY = parent.center.y + parent.halfH + standoff
  const endY = child.center.y - child.halfH - standoff
  return startY <= endY
}

/** Parent lines use lower-to-upper rails only when a future node-level policy
 * explicitly requests it. Current canvas relations use the full border. */
export function relationAnchorRegion(
  type: RelationType,
  endpoint: RelationEndpoint,
  strict: boolean,
): RelationAnchorRegion {
  if (!usesStrictParentGeometry(type, strict)) return 'any'
  return endpoint === 'from' ? 'lower' : 'upper'
}

export function usesStrictParentGeometry(type: RelationType, strict: boolean): boolean {
  return type === 'parent' && strict
}
