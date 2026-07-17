import type { Vector2D } from '../types/spatial'

const PORT_STANDOFF = 8
const PORT_INSET = 24

export interface DependencyEndpointGeometry {
  center: Vector2D
  halfW: number
  halfH: number
}

export function dependencyStatusLabel(dependentTitle: string, prerequisiteTitles: string[]): string {
  return `${dependentTitle} waiting on ${prerequisiteTitles.filter(Boolean).join(', ') || 'dependency'}`
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Dependencies are directional, unlike family-style relations: a
 * prerequisite always leaves the right rail and enters the dependent on its
 * left rail. The y coordinate still slides toward the other endpoint so the
 * route stays short and does not pile every line onto the card center.
 */
export function dependencyAnchors(
  prerequisite: DependencyEndpointGeometry,
  dependent: DependencyEndpointGeometry,
): { start: Vector2D; end: Vector2D } {
  const prerequisiteInset = Math.min(PORT_INSET, Math.max(0, prerequisite.halfH - 1))
  const dependentInset = Math.min(PORT_INSET, Math.max(0, dependent.halfH - 1))
  return {
    start: {
      x: prerequisite.center.x + prerequisite.halfW + PORT_STANDOFF,
      y: clamp(
        dependent.center.y,
        prerequisite.center.y - prerequisite.halfH + prerequisiteInset,
        prerequisite.center.y + prerequisite.halfH - prerequisiteInset,
      ),
    },
    end: {
      x: dependent.center.x - dependent.halfW - PORT_STANDOFF,
      y: clamp(
        prerequisite.center.y,
        dependent.center.y - dependent.halfH + dependentInset,
        dependent.center.y + dependent.halfH - dependentInset,
      ),
    },
  }
}
