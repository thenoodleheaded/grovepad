/**
 * Pure geometry for aligning and distributing a selection.
 *
 * The store speaks in MOVE UNITS, not raw widgets: a glue cluster or a
 * strictly-held family moves as one block, so aligning a selection that
 * contains a cluster lines the CLUSTER up as a unit instead of stacking its
 * members on one edge. Each unit carries the ids that must receive the same
 * delta and the united bounds those ids currently occupy.
 */

export type AlignMode = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'

export interface MoveUnit {
  ids: string[]
  bounds: { x: number; y: number; width: number; height: number }
}

export type UnitDeltas = Map<string, { dx: number; dy: number }>

/** Deltas that line every unit up on the selection's shared edge or center. */
export function alignUnitDeltas(units: MoveUnit[], mode: AlignMode): UnitDeltas {
  const deltas: UnitDeltas = new Map()
  if (units.length < 2) return deltas
  const minX = Math.min(...units.map((u) => u.bounds.x))
  const maxRight = Math.max(...units.map((u) => u.bounds.x + u.bounds.width))
  const minY = Math.min(...units.map((u) => u.bounds.y))
  const maxBottom = Math.max(...units.map((u) => u.bounds.y + u.bounds.height))
  const centerX = (minX + maxRight) / 2
  const centerY = (minY + maxBottom) / 2
  for (const unit of units) {
    const b = unit.bounds
    let dx = 0
    let dy = 0
    if (mode === 'left') dx = minX - b.x
    else if (mode === 'right') dx = maxRight - (b.x + b.width)
    else if (mode === 'center-h') dx = centerX - (b.x + b.width / 2)
    else if (mode === 'top') dy = minY - b.y
    else if (mode === 'bottom') dy = maxBottom - (b.y + b.height)
    else dy = centerY - (b.y + b.height / 2)
    if (dx !== 0 || dy !== 0) {
      for (const id of unit.ids) deltas.set(id, { dx, dy })
    }
  }
  return deltas
}

/**
 * Deltas that spread the units with equal gaps along one axis. The outermost
 * units stay where they are; everything between slides to even the spacing.
 */
export function distributeUnitDeltas(units: MoveUnit[], axis: DistributeAxis): UnitDeltas {
  const deltas: UnitDeltas = new Map()
  if (units.length < 3) return deltas
  const horizontal = axis === 'horizontal'
  const start = (u: MoveUnit) => (horizontal ? u.bounds.x : u.bounds.y)
  const extent = (u: MoveUnit) => (horizontal ? u.bounds.width : u.bounds.height)
  const sorted = [...units].sort((a, b) => start(a) + extent(a) / 2 - (start(b) + extent(b) / 2))
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const spanStart = start(first)
  const spanEnd = start(last) + extent(last)
  const total = sorted.reduce((sum, u) => sum + extent(u), 0)
  const gap = (spanEnd - spanStart - total) / (sorted.length - 1)
  let cursor = spanStart
  for (const unit of sorted) {
    const d = cursor - start(unit)
    if (d !== 0) {
      for (const id of unit.ids) deltas.set(id, horizontal ? { dx: d, dy: 0 } : { dx: 0, dy: d })
    }
    cursor += extent(unit) + gap
  }
  return deltas
}
