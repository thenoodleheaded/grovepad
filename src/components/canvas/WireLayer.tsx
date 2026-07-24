import { memo, useMemo, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { ArrowRight, CirclePause, CirclePlay, Trash2, TriangleAlert } from 'lucide-react'
import { useCircuitStore } from '../../store/useCircuitStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useWidgetRestStore } from '../../store/useWidgetRestStore'
import { useWorldContentRect } from '../../hooks/useWorldContentRect'
import { widgetWithEffectiveSize } from '../../utils/widgetRest'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import type { Vector2D, Widget } from '../../types/spatial'
import type { Connection, TriggerEdge, WireTransformOp } from '../../types/circuit'
import {
  defaultTransform,
  suggestTransform,
  TRIGGER_EDGE_LABELS,
  TRIGGER_WIRE_COLOR,
  VALUE_TYPE_COLORS,
  WIRE_TRANSFORM_HINTS,
  WIRE_TRANSFORM_LABELS,
  WIRE_TRANSFORM_OPS,
} from '../../types/circuit'
import { flowCurve } from '../../utils/curve'
import {
  findInputPort,
  findOutputPort,
  inputPortsFor,
  outputPortsFor,
  portWorldPosition,
} from '../../utils/portGeometry'
import { fieldDescriptor, type FieldValue } from '../../widgets/fields'
import { applyTransform } from '../../engine/transforms'
import { CanvasEdge, CanvasEdgeLayer } from './CanvasEdge'

const PULSE_WINDOW_MS = 1400

interface WireDescriptor {
  id: string
  d: string
  mid: Vector2D
  color: string
  isTrigger: boolean
  enabled: boolean
  damped: boolean
  pulseKey: number | null
  valueLabel: string | null
}

function shortValue(value: FieldValue): string {
  if (Array.isArray(value)) return `${value.length} pts`
  if (typeof value === 'number') {
    return Math.abs(value) >= 1000 ? value.toFixed(0) : String(Math.round(value * 100) / 100)
  }
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  const text = value.trim()
  return text.length > 14 ? `${text.slice(0, 13)}…` : text || '""'
}

function wireEndpoints(
  connection: Connection,
  source: Widget,
  target: Widget,
): { start: Vector2D; end: Vector2D } | null {
  const fromPort = findOutputPort(source.type, connection.fromField)
  if (!fromPort) return null
  const toPort =
    connection.kind === 'value'
      ? connection.toField
        ? findInputPort(target.type, connection.toField, 'field')
        : undefined
      : connection.command
        ? findInputPort(target.type, connection.command, 'command')
        : undefined
  if (!toPort) return null
  return {
    start: portWorldPosition(source, 'out', fromPort.index, outputPortsFor(source.type).length),
    end: portWorldPosition(target, 'in', toPort.index, inputPortsFor(target.type).length),
  }
}

const Wire = memo(function Wire({
  wire,
  onOpen,
}: {
  wire: WireDescriptor
  onOpen: (connectionId: string, x: number, y: number) => void
}) {
  const stroke = wire.damped ? '#f87171' : wire.enabled ? wire.color : '#525b6b'
  return (
    <CanvasEdge
      d={wire.d}
      variant="wire"
      style={{ '--gp-wire-color': stroke } as CSSProperties}
      halo={{ stroke, width: 7 }}
      main={{
        stroke,
        width: wire.isTrigger ? 1.8 : 2.1,
        dash: wire.isTrigger ? '5 5' : !wire.enabled ? '2 5' : undefined,
      }}
      hitArea={{
        width: 16,
        cursor: 'pointer',
        onPointerDown: (event) => {
          event.preventDefault()
          event.stopPropagation()
          onOpen(wire.id, event.clientX, event.clientY)
        },
        onContextMenu: (event) => {
          event.preventDefault()
          event.stopPropagation()
          onOpen(wire.id, event.clientX, event.clientY)
        },
      }}
    >
      {wire.pulseKey !== null && wire.enabled && !wire.damped && (
        <path
          key={wire.pulseKey}
          className="gp-wire-fire"
          d={wire.d}
          fill="none"
          stroke={stroke}
          strokeWidth={3.4}
          strokeLinecap="round"
          pathLength={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {wire.damped && (
        <g transform={`translate(${wire.mid.x}, ${wire.mid.y})`}>
          <circle r={9} fill="#111827" stroke="#f87171" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          <text x={0} y={0.5} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={800} fill="#f87171">
            !
          </text>
        </g>
      )}
      {wire.valueLabel !== null && !wire.damped && (
        <g className="gp-wire-chip" transform={`translate(${wire.mid.x}, ${wire.mid.y})`}>
          <rect
            x={-wire.valueLabel.length * 3.4 - 7}
            y={-9}
            width={wire.valueLabel.length * 6.8 + 14}
            height={18}
            rx={9}
            fill="#0c1017"
            stroke={stroke}
            strokeOpacity={0.55}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text x={0} y={0.5} textAnchor="middle" dominantBaseline="central" fontSize={10} fontFamily="var(--font-sans)" fill={stroke}>
            {wire.valueLabel}
          </text>
        </g>
      )}
    </CanvasEdge>
  )
})

/** The live ghost wire while dragging from an output port. */
function GhostWire() {
  const drag = useCircuitStore((state) => state.wireDrag)
  const source = useWidgetStore((state) => (drag ? state.widgets[drag.fromId] : undefined))
  if (!drag || !source) return null
  const port = findOutputPort(source.type, drag.fromField)
  if (!port) return null
  const start = portWorldPosition(source, 'out', port.index, outputPortsFor(source.type).length)
  const { d } = flowCurve(start, drag.cursorWorld)
  const color = VALUE_TYPE_COLORS[drag.valueType]
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="gp-wire-ghost" />
      <circle cx={drag.cursorWorld.x} cy={drag.cursorWorld.y} r={4} fill={color} vectorEffect="non-scaling-stroke" />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Wire inspector — everything about one wire in a small popover.
// ---------------------------------------------------------------------------

function numberInput(value: number, onCommit: (next: number) => void, label: string) {
  return (
    <label key={label} className="gp-field-island flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5">
      <span className="text-[9px] uppercase tracking-wide text-neutral-600">{label}</span>
      <input
        type="number"
        defaultValue={value}
        aria-label={label}
        onBlur={(event) => onCommit(parseFloat(event.currentTarget.value) || 0)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit(parseFloat(event.currentTarget.value) || 0)
        }}
        className="gp-input w-full rounded-lg px-2 py-1 text-xs outline-none"
      />
    </label>
  )
}

function WireInspector({
  connectionId,
  x,
  y,
  onClose,
}: {
  connectionId: string
  x: number
  y: number
  onClose: () => void
}) {
  const connection = useWidgetStore((state) => state.connections[connectionId])
  const source = useWidgetStore((state) => state.widgets[connection?.fromId ?? ''])
  const target = useWidgetStore((state) => state.widgets[connection?.toId ?? ''])
  const damped = useCircuitStore((state) => state.dampedIds.has(connectionId))
  useOverlayLifecycle(true)
  if (!connection || !source || !target) return null

  const update = (patch: Partial<Omit<Connection, 'id'>>) =>
    useWidgetStore.getState().updateConnection(connectionId, patch)
  const sourceField = fieldDescriptor(source.type, connection.fromField)
  const targetCommandPort = findInputPort(target.type, connection.command ?? '', 'command')
  const targetLabel =
    connection.kind === 'value'
      ? fieldDescriptor(target.type, connection.toField ?? '')?.label ?? connection.toField
      : targetCommandPort?.label ?? connection.command
  const transform = connection.transform ?? { op: 'identity' as const }
  const accent = connection.kind === 'trigger' ? TRIGGER_WIRE_COLOR : VALUE_TYPE_COLORS[sourceField?.valueType ?? 'text']
  // Value wires always carry a transform; trigger wires only show one when
  // the target command actually reads the payload (add_item-style appenders).
  const showTransform = connection.kind === 'value' || targetCommandPort?.acceptsPayload === true

  const left = Math.max(8, Math.min(x, window.innerWidth - 268))
  const top = Math.max(8, Math.min(y, window.innerHeight - 330))
  const truncate = (value: string, length = 15) => (value.length > length ? `${value.slice(0, length)}…` : value)

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault()
          onClose()
        }}
      />
      <div
        className="gp-popup-menu gp-menu gp-pop gp-panel fixed z-50 max-h-[calc(100dvh-16px)] w-64 origin-top-left overflow-y-auto rounded-2xl p-2 shadow-2xl"
        style={{ left, top }}
      >
        <p className="px-2 pt-1  text-[10px] uppercase tracking-widest" style={{ color: accent }}>
          {connection.kind === 'trigger' ? 'Trigger wire' : 'Value wire'}
        </p>
        <p className="flex items-center gap-1 px-2 pb-2 pt-0.5 text-[10px] leading-4 text-neutral-400">
          <span className="truncate">{truncate(source.title)}·{sourceField?.label ?? connection.fromField}</span>
          <ArrowRight size={9} className="shrink-0 text-neutral-600" aria-hidden />
          <span className="truncate">{truncate(target.title)}·{targetLabel}</span>
        </p>

        {damped && (
          <div className="mx-1 mb-2 flex items-start gap-1.5 rounded-xl border border-red-500/25 bg-red-500/5 p-2 text-[10px] leading-4 text-red-300">
            <TriangleAlert size={11} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Loop breaker tripped — this wire was oscillating and is paused.
              <button
                type="button"
                onClick={() => useCircuitStore.getState().clearDamped()}
                className="ml-1 font-semibold underline underline-offset-2"
              >
                Re-arm
              </button>
            </span>
          </div>
        )}

        {showTransform && (
          <div className="mx-1 mb-2 rounded-xl border gp-hairline p-2">
            <label className="gp-field-island flex flex-col gap-1 px-2 py-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-600">
                {connection.kind === 'trigger' ? 'Payload transform' : 'Transform'}
              </span>
              <select
                value={transform.op}
                onChange={(event) =>
                  update({ transform: defaultTransform(event.currentTarget.value as WireTransformOp) })
                }
                className="gp-input w-full rounded-lg px-2 py-1.5 text-xs outline-none"
              >
                {WIRE_TRANSFORM_OPS.map((op) => (
                  <option key={op} value={op}>
                    {WIRE_TRANSFORM_LABELS[op]}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1 px-0.5 text-[9px] leading-3 text-neutral-600">{WIRE_TRANSFORM_HINTS[transform.op]}</p>
            <div className="mt-1.5 flex gap-1.5">
              {transform.op === 'scale' && numberInput(transform.factor, (factor) => update({ transform: { op: 'scale', factor } }), 'Factor')}
              {transform.op === 'offset' && numberInput(transform.amount, (amount) => update({ transform: { op: 'offset', amount } }), 'Amount')}
              {transform.op === 'clamp' && (
                <>
                  {numberInput(transform.min, (min) => update({ transform: { ...transform, min } }), 'Min')}
                  {numberInput(transform.max, (max) => update({ transform: { ...transform, max } }), 'Max')}
                </>
              )}
              {transform.op === 'threshold' && numberInput(transform.value, (value) => update({ transform: { op: 'threshold', value } }), 'At least')}
            </div>
            {transform.op === 'map_range' && (
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {numberInput(transform.inMin, (inMin) => update({ transform: { ...transform, inMin } }), 'In min')}
                {numberInput(transform.inMax, (inMax) => update({ transform: { ...transform, inMax } }), 'In max')}
                {numberInput(transform.outMin, (outMin) => update({ transform: { ...transform, outMin } }), 'Out min')}
                {numberInput(transform.outMax, (outMax) => update({ transform: { ...transform, outMax } }), 'Out max')}
              </div>
            )}
            {transform.op === 'format' && (
              <label className="gp-field-island mt-1.5 flex flex-col gap-0.5 px-2 py-1.5">
                <span className="text-[9px] uppercase tracking-wide text-neutral-600">Template ({'{value}'})</span>
                <input
                  type="text"
                  defaultValue={transform.template}
                  aria-label="Format template"
                  onBlur={(event) => update({ transform: { op: 'format', template: event.currentTarget.value } })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') update({ transform: { op: 'format', template: event.currentTarget.value } })
                  }}
                  className="gp-input w-full rounded-lg px-2 py-1 text-xs outline-none"
                />
              </label>
            )}
          </div>
        )}

        {connection.kind === 'trigger' && (
          <div className="mx-1 mb-2 rounded-xl border gp-hairline p-2">
            <label className="gp-field-island flex flex-col gap-1 px-2 py-1.5">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-600">Fires when source…</span>
              <select
                value={connection.edge ?? 'rising'}
                onChange={(event) => update({ edge: event.currentTarget.value as TriggerEdge })}
                className="gp-input w-full rounded-lg px-2 py-1.5 text-xs outline-none"
              >
                {(Object.keys(TRIGGER_EDGE_LABELS) as TriggerEdge[]).map((edge) => (
                  <option key={edge} value={edge}>
                    {TRIGGER_EDGE_LABELS[edge]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <button
          type="button"
          onClick={() => update({ enabled: !connection.enabled })}
          className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-neutral-300 hover:bg-neutral-800"
        >
          {connection.enabled ? <CirclePause size={12} aria-hidden /> : <CirclePlay size={12} aria-hidden />}
          {connection.enabled ? 'Disable wire' : 'Enable wire'}
        </button>
        <button
          type="button"
          onClick={() => {
            useWidgetStore.getState().deleteConnection(connectionId)
            onClose()
          }}
          className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-red-400 hover:bg-red-500/10"
        >
          <Trash2 size={12} aria-hidden />
          Delete wire
        </button>
      </div>
    </>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Field picker — a wire dropped on a card body chooses its landing input.
// ---------------------------------------------------------------------------

function FieldPicker() {
  const drop = useCircuitStore((state) => state.pendingDrop)
  const target = useWidgetStore((state) => state.widgets[drop?.toId ?? ''])
  useOverlayLifecycle(drop !== null)
  if (!drop || !target) return null

  const ports = inputPortsFor(target.type)
  const fields = ports.filter((port) => port.kind === 'field')
  const commands = ports.filter((port) => port.kind === 'command')
  const close = () => useCircuitStore.getState().setPendingDrop(null)
  const left = Math.max(8, Math.min(drop.screen.x, window.innerWidth - 240))
  const top = Math.max(8, Math.min(drop.screen.y, window.innerHeight - 320))

  const pick = (port: (typeof ports)[number]) => {
    const state = useWidgetStore.getState()
    if (port.kind === 'field') {
      const sourceType = state.widgets[drop.fromId]?.type
      const sourceUnit = sourceType
        ? outputPortsFor(sourceType).find((candidate) => candidate.key === drop.fromField)?.unit
        : undefined
      state.addConnection({
        fromId: drop.fromId,
        fromField: drop.fromField,
        toId: drop.toId,
        kind: 'value',
        toField: port.key,
        transform: suggestTransform(sourceUnit, port.unit),
      })
    } else {
      state.addConnection({
        fromId: drop.fromId,
        fromField: drop.fromField,
        toId: drop.toId,
        kind: 'trigger',
        command: port.key as never,
        edge: drop.valueType === 'boolean' ? 'rising' : 'change',
      })
    }
    close()
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onPointerDown={close} />
      <div
        className="gp-popup-menu gp-menu gp-pop gp-panel fixed z-50 max-h-[min(60vh,340px)] w-56 origin-top-left overflow-y-auto rounded-2xl p-1.5 shadow-2xl"
        style={{ left, top }}
      >
        <p className="px-3 py-1.5 text-[10px] leading-4 text-neutral-500">
          Wire into <span className="font-medium text-neutral-300">{target.title}</span>
        </p>
        {fields.length > 0 && (
          <p className="px-3 pb-0.5 pt-1  text-[9px] uppercase tracking-widest text-neutral-600">Set a value</p>
        )}
        {fields.map((port) => (
          <button
            key={`field-${port.key}`}
            type="button"
            onClick={() => pick(port)}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-neutral-300 hover:bg-neutral-800"
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: VALUE_TYPE_COLORS[port.valueType ?? 'text'] }}
            />
            {port.label}
          </button>
        ))}
        {commands.length > 0 && (
          <p className="px-3 pb-0.5 pt-1.5  text-[9px] uppercase tracking-widest text-neutral-600">Trigger an action</p>
        )}
        {commands.map((port) => (
          <button
            key={`command-${port.key}`}
            type="button"
            onClick={() => pick(port)}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-neutral-300 hover:bg-neutral-800"
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rotate-45 rounded-[3px]"
              style={{ background: TRIGGER_WIRE_COLOR }}
            />
            {port.label}
          </button>
        ))}
        {fields.length === 0 && commands.length === 0 && (
          <p className="px-3 py-2 text-[10px] text-neutral-500">This widget accepts no inputs.</p>
        )}
      </div>
    </>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// The layer
// ---------------------------------------------------------------------------

export function WireLayer() {
  const { connections, widgets, activeCanvasId } = useWidgetStore(
    useShallow((state) => ({
      connections: state.connections,
      widgets: state.widgets,
      activeCanvasId: state.activeCanvasId,
    })),
  )
  const expandedWidgetId = useWidgetRestStore((state) => state.expandedWidgetId)
  const expandedOffset = useWidgetRestStore((state) => state.expandedOffset)
  const circuitMode = useCircuitStore((state) => state.circuitMode)
  const firePulses = useCircuitStore((state) => state.firePulses)
  const dampedIds = useCircuitStore((state) => state.dampedIds)
  const inspector = useCircuitStore((state) => state.inspector)
  const dragActive = useCircuitStore((state) => state.wireDrag !== null)
  const contentRect = useWorldContentRect()

  const wires = useMemo(() => {
    const now = Date.now()
    const relevant: Connection[] = []
    for (const connection of Object.values(connections)) {
      const source = widgets[connection.fromId]
      const target = widgets[connection.toId]
      if (source?.canvasId === activeCanvasId && target?.canvasId === activeCanvasId) {
        relevant.push(connection)
      }
    }
    const showValues = circuitMode && relevant.length <= 80
    const result: WireDescriptor[] = []
    for (const connection of relevant) {
      const source = widgets[connection.fromId]!
      const target = widgets[connection.toId]!
      // Wires land on the on-screen footprint — a resting tile's edge, not
      // the dormant full-card bounds.
      const endpoints = wireEndpoints(
        connection,
        widgetWithEffectiveSize(source, { expandedWidgetId, expandedOffset }),
        widgetWithEffectiveSize(target, { expandedWidgetId, expandedOffset }),
      )
      if (!endpoints) continue
      const curve = flowCurve(endpoints.start, endpoints.end)
      const sourceField = fieldDescriptor(source.type, connection.fromField)
      const pulseAt = firePulses[connection.id]
      let valueLabel: string | null = null
      if (showValues && connection.kind === 'value' && sourceField) {
        valueLabel = shortValue(applyTransform(sourceField.get(source.data), connection.transform))
      }
      result.push({
        id: connection.id,
        d: curve.d,
        mid: curve.mid,
        color:
          connection.kind === 'trigger'
            ? TRIGGER_WIRE_COLOR
            : VALUE_TYPE_COLORS[sourceField?.valueType ?? 'text'],
        isTrigger: connection.kind === 'trigger',
        enabled: connection.enabled,
        damped: dampedIds.has(connection.id),
        pulseKey: pulseAt !== undefined && now - pulseAt < PULSE_WINDOW_MS ? pulseAt : null,
        valueLabel,
      })
    }
    return result
  }, [activeCanvasId, circuitMode, connections, dampedIds, expandedOffset, expandedWidgetId, firePulses, widgets])

  const openInspector = useCircuitStore((state) => state.openInspector)
  const closeInspector = useCircuitStore((state) => state.closeInspector)

  if (wires.length === 0 && !dragActive && !inspector) return <FieldPicker />

  return (
    <>
      <CanvasEdgeLayer contentRect={contentRect} dataCircuitLayer>
        {wires.map((wire) => (
          <Wire key={wire.id} wire={wire} onOpen={openInspector} />
        ))}
        <GhostWire />
      </CanvasEdgeLayer>
      {inspector && (
        <WireInspector
          connectionId={inspector.connectionId}
          x={inspector.x}
          y={inspector.y}
          onClose={closeInspector}
        />
      )}
      <FieldPicker />
    </>
  )
}
