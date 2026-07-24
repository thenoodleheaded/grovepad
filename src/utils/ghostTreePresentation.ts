export const GHOST_ICON_SIZE = 28
const GHOST_ICON_GAP = 4
const GHOST_NODE_PADDING = 6
const GHOST_EMPTY_SIZE = 40

interface GhostIconPlacement {
  x: number
  y: number
}

export interface GhostNodeGrid {
  columns: number
  rows: number
  rowCounts: number[]
  width: number
  height: number
  placements: GhostIconPlacement[]
}

function balancedRowCounts(itemCount: number): number[] {
  const rowCount = Math.max(1, Math.round(Math.sqrt(itemCount)))
  const base = Math.floor(itemCount / rowCount)
  const counts = Array.from({ length: rowCount }, () => base)
  let remaining = itemCount - base * rowCount
  const center = (rowCount - 1) / 2
  const priority = counts
    .map((_, index) => index)
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b)
  for (const index of priority) {
    if (remaining === 0) break
    counts[index]! += 1
    remaining -= 1
  }
  return counts
}

/**
 * Packs icons into the closest practical square. Incomplete final rows are
 * centered, so three, five, seven, and similar counts read as one balanced
 * bundle instead of a left-heavy spreadsheet row.
 */
export function ghostNodeGrid(count: number): GhostNodeGrid {
  const itemCount = Math.max(0, Math.floor(count))
  if (itemCount === 0) {
    return {
      columns: 1,
      rows: 1,
      rowCounts: [],
      width: GHOST_EMPTY_SIZE,
      height: GHOST_EMPTY_SIZE,
      placements: [],
    }
  }

  const rowCounts = balancedRowCounts(itemCount)
  const columns = Math.max(...rowCounts)
  const rows = rowCounts.length
  const width = Math.max(
    GHOST_EMPTY_SIZE,
    GHOST_NODE_PADDING * 2 + columns * GHOST_ICON_SIZE + (columns - 1) * GHOST_ICON_GAP,
  )
  const height = Math.max(
    GHOST_EMPTY_SIZE,
    GHOST_NODE_PADDING * 2 + rows * GHOST_ICON_SIZE + (rows - 1) * GHOST_ICON_GAP,
  )
  const placements: GhostIconPlacement[] = []

  for (let row = 0; row < rows; row += 1) {
    const rowCount = rowCounts[row]!
    const rowWidth = rowCount * GHOST_ICON_SIZE + Math.max(0, rowCount - 1) * GHOST_ICON_GAP
    const rowStart = (width - rowWidth) / 2
    for (let column = 0; column < rowCount; column += 1) {
      placements.push({
        x: rowStart + column * (GHOST_ICON_SIZE + GHOST_ICON_GAP),
        y: GHOST_NODE_PADDING + row * (GHOST_ICON_SIZE + GHOST_ICON_GAP),
      })
    }
  }

  return { columns, rows, rowCounts, width, height, placements }
}

interface PathPoint {
  x: number
  y: number
}

function roundedPolygonPath(points: readonly PathPoint[], radius: number): string {
  if (points.length < 3) return ''
  const corner = (index: number) => {
    const previous = points[(index - 1 + points.length) % points.length]!
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    const incoming = Math.hypot(previous.x - current.x, previous.y - current.y)
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y)
    const amount = Math.min(radius, incoming / 2, outgoing / 2)
    return {
      current,
      before: {
        x: current.x + ((previous.x - current.x) / Math.max(1, incoming)) * amount,
        y: current.y + ((previous.y - current.y) / Math.max(1, incoming)) * amount,
      },
      after: {
        x: current.x + ((next.x - current.x) / Math.max(1, outgoing)) * amount,
        y: current.y + ((next.y - current.y) / Math.max(1, outgoing)) * amount,
      },
    }
  }
  const corners = points.map((_, index) => corner(index))
  let path = `M ${corners[0]!.before.x} ${corners[0]!.before.y}`
  for (const item of corners) {
    path += ` Q ${item.current.x} ${item.current.y} ${item.after.x} ${item.after.y}`
    const next = corners[(corners.indexOf(item) + 1) % corners.length]!
    path += ` L ${next.before.x} ${next.before.y}`
  }
  return `${path} Z`
}

function simplifyPolygon(points: readonly PathPoint[]): PathPoint[] {
  const distinct = points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]!
    return point.x !== previous.x || point.y !== previous.y
  })
  return distinct.filter((point, index) => {
    const previous = distinct[(index - 1 + distinct.length) % distinct.length]!
    const next = distinct[(index + 1) % distinct.length]!
    return !(
      (previous.x === point.x && point.x === next.x) ||
      (previous.y === point.y && point.y === next.y)
    )
  })
}

/** A stepped, rounded hull that follows the occupied icon rows. */
export function ghostNodeContourPath(grid: GhostNodeGrid): string {
  if (grid.placements.length === 0) {
    return roundedPolygonPath([
      { x: 1, y: 1 },
      { x: grid.width - 1, y: 1 },
      { x: grid.width - 1, y: grid.height - 1 },
      { x: 1, y: grid.height - 1 },
    ], 7)
  }

  const contourPadding = GHOST_NODE_PADDING - 1
  const rowBounds = grid.rowCounts.map((count, row) => {
    const firstIndex = grid.rowCounts.slice(0, row).reduce((total, value) => total + value, 0)
    const first = grid.placements[firstIndex]!
    const last = grid.placements[firstIndex + count - 1]!
    return {
      left: first.x - contourPadding,
      right: last.x + GHOST_ICON_SIZE + contourPadding,
      top: row === 0 ? 1 : first.y - GHOST_ICON_GAP / 2,
      bottom: row === grid.rows - 1
        ? grid.height - 1
        : first.y + GHOST_ICON_SIZE + GHOST_ICON_GAP / 2,
    }
  })
  const points: PathPoint[] = [
    { x: rowBounds[0]!.left, y: rowBounds[0]!.top },
    { x: rowBounds[0]!.right, y: rowBounds[0]!.top },
  ]
  for (let row = 0; row < rowBounds.length - 1; row += 1) {
    const current = rowBounds[row]!
    const next = rowBounds[row + 1]!
    points.push({ x: current.right, y: current.bottom })
    points.push({ x: next.right, y: current.bottom })
  }
  const last = rowBounds.at(-1)!
  points.push({ x: last.right, y: last.bottom }, { x: last.left, y: last.bottom })
  for (let row = rowBounds.length - 1; row > 0; row -= 1) {
    const current = rowBounds[row]!
    const previous = rowBounds[row - 1]!
    points.push({ x: current.left, y: current.top })
    points.push({ x: previous.left, y: current.top })
  }
  return roundedPolygonPath(simplifyPolygon(points), 7)
}

const DASH_LENGTH = 6
const DASH_GAP = 8
const DASH_STEP = DASH_LENGTH + DASH_GAP

/** One overlaid SVG stroke per accent paints every Nth dash. */
export function ghostAccentDash(
  accentIndex: number,
  accentCount: number,
): { dasharray: string; dashoffset: number } {
  const count = Math.max(1, Math.floor(accentCount))
  const index = ((Math.floor(accentIndex) % count) + count) % count
  return {
    dasharray: `${DASH_LENGTH} ${DASH_STEP * count - DASH_LENGTH}`,
    dashoffset: index === 0 ? 0 : -index * DASH_STEP,
  }
}
