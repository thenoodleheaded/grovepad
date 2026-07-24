import { GRID_SIZE } from '../types/spatial'

export const MIN_WIDGET_WIDTH = GRID_SIZE
export const MIN_WIDGET_HEIGHT = GRID_SIZE
export const LAYOUT_GAP = 24
/** Spacing between two widgets packed inside a committed tree bundle:
 * exactly one grid cell. */
export const TREE_CLUSTER_GAP = GRID_SIZE
/** Hierarchy is an ordering boundary, not extra whitespace: a child's top
 * may meet but never cross the lowest bottom edge of its parent's row.
 * Ordinary settle/collision spacing remains independently enforced. */
export const MIN_PARENT_CHILD_GAP = 0
export const SETTLE_ITERATION_LIMIT = 180
