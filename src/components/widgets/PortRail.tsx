import { memo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useCircuitStore } from '../../store/useCircuitStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { screenToWorld } from '../../types/spatial'
import { suggestTransform, TRIGGER_WIRE_COLOR, VALUE_TYPE_COLORS } from '../../types/circuit'
import {
  findWireTarget,
  inputPortsFor,
  outputPortsFor,
  portRailOffset,
  type PortSpec,
} from '../../utils/portGeometry'

// ---------------------------------------------------------------------------
// Port rails — the quiet circuit affordance on every card.
//
// Circuit Mode owns the rails: outside that mode they do not mount at all.
// Output ports (readable fields) sit on the right rail, input ports (settable
// fields + commands) on the left. Labels stay quiet until their widget is
// hovered, then extend away from the card edge. Geometry comes from
// portGeometry.ts, the same pure math the wire layer uses, so a wire always
// lands exactly on its dot.
// ---------------------------------------------------------------------------

export const PortRail = memo(function PortRail({ widgetId }: { widgetId: string }) {
  const widget = useWidgetStore((state) => state.widgets[widgetId])
  const circuitMode = useCircuitStore((state) => state.circuitMode)
  const dragActive = useCircuitStore((state) => state.wireDrag !== null)
  const isDragSource = useCircuitStore((state) => state.wireDrag?.fromId === widgetId)
  const dragFromField = useCircuitStore((state) =>
    state.wireDrag?.fromId === widgetId ? state.wireDrag.fromField : null,
  )
  const hoverPortKey = useCircuitStore((state) =>
    state.wireDrag?.hover?.widgetId === widgetId ? state.wireDrag.hover.portKey : null,
  )
  const rafRef = useRef(0)

  if (!widget || !circuitMode) return null
  const showOutputs = !dragActive || isDragSource

  const outs = outputPortsFor(widget.type)
  const ins = inputPortsFor(widget.type)

  const connectToPort = (targetId: string, port: PortSpec) => {
    const circuit = useCircuitStore.getState()
    const drag = circuit.wireDrag
    if (!drag || drag.fromId === targetId) return
    const state = useWidgetStore.getState()
    const sourceType = state.widgets[drag.fromId]?.type
    if (!sourceType) return
    if (port.kind === 'field') {
      const sourceUnit = outputPortsFor(sourceType).find((item) => item.key === drag.fromField)?.unit
      state.addConnection({
        fromId: drag.fromId,
        fromField: drag.fromField,
        toId: targetId,
        kind: 'value',
        toField: port.key,
        transform: suggestTransform(sourceUnit, port.unit),
      })
    } else {
      state.addConnection({
        fromId: drag.fromId,
        fromField: drag.fromField,
        toId: targetId,
        kind: 'trigger',
        command: port.key as never,
        edge: drag.valueType === 'boolean' ? 'rising' : 'change',
      })
    }
    circuit.endWireDrag()
  }

  const beginKeyboardWire = (port: PortSpec) => {
    const circuit = useCircuitStore.getState()
    if (circuit.wireDrag?.fromId === widgetId && circuit.wireDrag.fromField === port.key) {
      circuit.endWireDrag()
      return
    }
    circuit.endWireDrag()
    circuit.startWireDrag({
      fromId: widgetId,
      fromField: port.key,
      valueType: port.valueType ?? 'text',
      cursorWorld: { x: widget.position.x + widget.size.width, y: widget.position.y + widget.size.height / 2 },
    })
  }

  const beginWire = (event: ReactPointerEvent<HTMLButtonElement>, port: PortSpec) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // A pointer that vanished mid-gesture must not kill the wire drag.
    }
    const { pan, zoom } = useCanvasStore.getState()
    const world = screenToWorld({ x: event.clientX, y: event.clientY }, { x: pan.x, y: pan.y, zoom })
    useCircuitStore.getState().startWireDrag({
      fromId: widgetId,
      fromField: port.key,
      valueType: port.valueType ?? 'text',
      cursorWorld: world,
    })
  }

  const moveWire = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!useCircuitStore.getState().wireDrag) return
    const { clientX, clientY } = event
    if (rafRef.current !== 0) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const circuit = useCircuitStore.getState()
      if (!circuit.wireDrag) return
      const { pan, zoom } = useCanvasStore.getState()
      const world = screenToWorld({ x: clientX, y: clientY }, { x: pan.x, y: pan.y, zoom })
      const state = useWidgetStore.getState()
      const hit = findWireTarget(world, state.widgets, state.activeCanvasId, widgetId)
      circuit.updateWireDrag(
        world,
        hit?.port ? { widgetId: hit.widgetId, portKey: hit.port.key, portKind: hit.port.kind } : null,
      )
    })
  }

  const endWire = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const circuit = useCircuitStore.getState()
    const drag = circuit.wireDrag
    if (!drag) return
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    const { pan, zoom } = useCanvasStore.getState()
    const world = screenToWorld({ x: event.clientX, y: event.clientY }, { x: pan.x, y: pan.y, zoom })
    const state = useWidgetStore.getState()
    const hit = findWireTarget(world, state.widgets, state.activeCanvasId, widgetId)
    if (!hit) { circuit.endWireDrag(); return }
    if (hit.port) {
      connectToPort(hit.widgetId, hit.port)
      return
    }
    // Dropped on a card body — the field picker resolves which input.
    circuit.setPendingDrop({
      fromId: drag.fromId,
      fromField: drag.fromField,
      valueType: drag.valueType,
      toId: hit.widgetId,
      screen: { x: event.clientX, y: event.clientY },
    })
    circuit.endWireDrag()
  }

  return (
    <div
      role="group"
      aria-label={`Circuit ports for ${widget.title}`}
      data-expanded={!widget.collapsed && !widget.iconified || undefined}
      className="gp-port-rail pointer-events-none absolute inset-0 z-30"
    >
      {showOutputs &&
        outs.map((port) => (
          <button
            key={`out-${port.key}`}
            type="button"
            aria-label={`Start connection from ${port.label} output of ${widget.title}`}
            aria-pressed={dragFromField === port.key}
            title={`${port.label} — drag to wire`}
            data-active={dragFromField === port.key || undefined}
            className="gp-port gp-port-out pointer-events-auto"
            style={{
              top: portRailOffset(widget.size.height, port.index, outs.length),
              '--gp-port-color': VALUE_TYPE_COLORS[port.valueType ?? 'text'],
            } as React.CSSProperties}
            onPointerDown={(event) => beginWire(event, port)}
            onPointerMove={moveWire}
            onPointerUp={endWire}
            onPointerCancel={() => useCircuitStore.getState().endWireDrag()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); useCircuitStore.getState().endWireDrag() }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                beginKeyboardWire(port)
              }
            }}
          >
            <span className="gp-port-label gp-port-label-out">{port.label}</span>
          </button>
        ))}
      {ins.map((port) => (
        <button
          key={`in-${port.kind}-${port.key}`}
          type="button"
          disabled={!dragActive || isDragSource}
          aria-label={`Connect to ${port.label} ${port.kind === 'command' ? 'command' : 'input'} of ${widget.title}`}
          title={port.label}
          data-command={port.kind === 'command' || undefined}
          data-hot={hoverPortKey === port.key || undefined}
          className="gp-port gp-port-in pointer-events-auto disabled:opacity-60"
          style={{
            top: portRailOffset(widget.size.height, port.index, ins.length),
            '--gp-port-color':
              port.kind === 'command'
                ? TRIGGER_WIRE_COLOR
                : VALUE_TYPE_COLORS[port.valueType ?? 'text'],
          } as React.CSSProperties}
          onClick={() => connectToPort(widgetId, port)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); useCircuitStore.getState().endWireDrag() }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              connectToPort(widgetId, port)
            }
          }}
        >
          <span className="gp-port-label gp-port-label-in">{port.label}</span>
        </button>
      ))}
    </div>
  )
})
