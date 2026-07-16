import type { ModuleType, Vector2D, Widget } from '../types/spatial'
import type { FieldValueType, SemanticUnit } from '../types/fieldConnections'
import { commandsFor, fieldsFor } from '../widgets/fields'

// ---------------------------------------------------------------------------
// Port geometry — the single source of truth for where a widget's circuit
// ports live. Pure math over widget state: the wire layer, the port rail
// overlay, and drop hit-testing all call these functions, so they agree on
// coordinates without any DOM measurement (the same discipline relation
// lines follow).
//
// Layout: output ports (every readable field) stack on the RIGHT rail;
// input ports (settable fields first, then commands) stack on the LEFT rail.
// Each rail clusters around the card's vertical center with spacing that
// remains usable across the card's allowed resize window.
// ---------------------------------------------------------------------------

/** Vertical padding each rail keeps from the card's top/bottom edge — clear
 *  of the rounded corner (r0 = 26) so no port ever sits on the curve. */
const RAIL_PADDING = 26
/** How far a drop may land from a port and still latch onto it (world px). */
const PORT_HIT_RADIUS = 22

export interface PortSpec {
  /** Field key, or command key for command ports. */
  key: string
  label: string
  kind: 'field' | 'command'
  /** Field ports only. */
  valueType?: FieldValueType
  /** Field ports only — advisory, drives auto-suggested transforms. */
  unit?: SemanticUnit
  /** Command ports only — whether `run` reads the trigger wire's payload. */
  acceptsPayload?: boolean
  /** Position in its rail — the port slot. */
  index: number
}

const outputCache = new Map<ModuleType, PortSpec[]>()
const inputCache = new Map<ModuleType, PortSpec[]>()

/** Every readable field — anything can be listened to. */
export function outputPortsFor(type: ModuleType): PortSpec[] {
  const cached = outputCache.get(type)
  if (cached) return cached
  const ports = fieldsFor(type).map<PortSpec>((field, index) => ({
    key: field.key,
    label: field.label,
    kind: 'field',
    valueType: field.valueType,
    unit: field.unit,
    index,
  }))
  outputCache.set(type, ports)
  return ports
}

/** Settable fields, then commands — everything a wire can drive. */
export function inputPortsFor(type: ModuleType): PortSpec[] {
  const cached = inputCache.get(type)
  if (cached) return cached
  const ports: PortSpec[] = []
  for (const field of fieldsFor(type)) {
    if (!field.set) continue
    ports.push({
      key: field.key,
      label: field.label,
      kind: 'field',
      valueType: field.valueType,
      unit: field.unit,
      index: ports.length,
    })
  }
  for (const command of commandsFor(type)) {
    ports.push({
      key: command.key,
      label: command.label,
      kind: 'command',
      acceptsPayload: command.acceptsPayload,
      index: ports.length,
    })
  }
  inputCache.set(type, ports)
  return ports
}

export function findOutputPort(type: ModuleType, key: string): PortSpec | undefined {
  return outputPortsFor(type).find((port) => port.key === key)
}

export function findInputPort(type: ModuleType, key: string, kind: PortSpec['kind']): PortSpec | undefined {
  return inputPortsFor(type).find((port) => port.key === key && port.kind === kind)
}

/**
 * Rail spacing for `count` ports on a card of the given height. Ports occupy
 * the ENTIRE usable side (corner padding to corner padding), evenly divided —
 * not clustered around the vertical center — so each port gets the maximum
 * possible hit target and the rail reads as the card's full connective edge.
 * Dense rails compress their spacing instead of overflowing beyond the
 * card. That keeps every visual port and hit target on the side it belongs
 * to, even for automation widgets with many inputs.
 */
function portSpacing(height: number, count: number): number {
  if (count <= 1) return 0
  const padding = Math.min(RAIL_PADDING, Math.max(0, height / 2))
  return Math.max(0, height - padding * 2) / (count - 1)
}

/** Card-local y coordinate for a port. Shared by the DOM rail and world-space
 * wire geometry so a visible dot, its hover target, and its wire endpoint are
 * always the same point. */
export function portRailOffset(height: number, index: number, count: number): number {
  if (count <= 1) return height / 2
  const padding = Math.min(RAIL_PADDING, Math.max(0, height / 2))
  return padding + index * portSpacing(height, count)
}

/** World position of one port on a widget's rail. */
export function portWorldPosition(
  widget: Pick<Widget, 'position' | 'size'>,
  side: 'in' | 'out',
  index: number,
  count: number,
): Vector2D {
  return {
    x: side === 'out' ? widget.position.x + widget.size.width : widget.position.x,
    y: widget.position.y + portRailOffset(widget.size.height, index, count),
  }
}

export interface WireTargetHit {
  widgetId: string
  port: PortSpec | null
}

/** The widget/port under a world point — ports win over card bodies. */
export function findWireTarget(
  world: Vector2D,
  widgets: Record<string, Widget>,
  activeCanvasId: string,
  excludeId: string,
): WireTargetHit | null {
  let portHit: WireTargetHit | null = null
  let bodyHit: WireTargetHit | null = null
  let bodyZ = -Infinity
  for (const widget of Object.values(widgets)) {
    if (widget.canvasId !== activeCanvasId || widget.id === excludeId) continue
    if (inputPortsFor(widget.type).length === 0) continue
    const port = hitTestInputPort(widget, world)
    if (port) portHit = { widgetId: widget.id, port }
    const inside =
      world.x >= widget.position.x &&
      world.x <= widget.position.x + widget.size.width &&
      world.y >= widget.position.y &&
      world.y <= widget.position.y + widget.size.height
    if (inside) {
      const z = widget.metadata.zIndex ?? 0
      if (z >= bodyZ) {
        bodyZ = z
        bodyHit = { widgetId: widget.id, port: null }
      }
    }
  }
  return portHit ?? bodyHit
}

/** The input port nearest a world point, if within the hit radius. */
export function hitTestInputPort(
  widget: Widget,
  world: Vector2D,
): PortSpec | null {
  const ports = inputPortsFor(widget.type)
  let best: PortSpec | null = null
  let bestDistance = PORT_HIT_RADIUS
  for (const port of ports) {
    const at = portWorldPosition(widget, 'in', port.index, ports.length)
    const distance = Math.hypot(at.x - world.x, at.y - world.y)
    if (distance <= bestDistance) {
      best = port
      bestDistance = distance
    }
  }
  return best
}
