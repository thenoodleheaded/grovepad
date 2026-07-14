import { create } from 'zustand'
import type { Vector2D } from '../types/spatial'
import type { FieldValueType } from '../types/fieldConnections'

// ---------------------------------------------------------------------------
// Circuit UI state — everything ephemeral about wiring. Persistent wires live
// in useWidgetStore.connections; this store carries the interaction session
// (port drags, the inspector, circuit mode) and the engine's visual telemetry
// (fire pulses, damped loops). Kept separate so high-frequency wire-drag
// updates never touch the widget store's subscribers.
// ---------------------------------------------------------------------------

export interface WireDrag {
  fromId: string
  fromField: string
  valueType: FieldValueType
  /** Cursor in world coordinates — the ghost wire's live endpoint. */
  cursorWorld: Vector2D
  /** Input-port candidate currently under the cursor, if any. */
  hover: { widgetId: string; portKey: string; portKind: 'field' | 'command' } | null
}

/** A wire dropped on a card body — the field picker resolves the target. */
export interface PendingWireDrop {
  fromId: string
  fromField: string
  valueType: FieldValueType
  toId: string
  screen: Vector2D
}

interface CircuitState {
  /** Circuit Mode — the whole live graph is illuminated. */
  circuitMode: boolean
  toggleCircuitMode: () => void

  wireDrag: WireDrag | null
  startWireDrag: (drag: Omit<WireDrag, 'hover'>) => void
  updateWireDrag: (cursorWorld: Vector2D, hover: WireDrag['hover']) => void
  endWireDrag: () => void

  pendingDrop: PendingWireDrop | null
  setPendingDrop: (drop: PendingWireDrop | null) => void

  /** Wire inspector popover target. */
  inspector: { connectionId: string; x: number; y: number } | null
  openInspector: (connectionId: string, x: number, y: number) => void
  closeInspector: () => void

  /** connectionId → last fire timestamp; drives the delivery pulse animation. */
  firePulses: Record<string, number>
  recordFires: (connectionIds: readonly string[]) => void

  /** Connections silenced by the loop breaker until the circuit is edited. */
  dampedIds: ReadonlySet<string>
  dampConnections: (connectionIds: readonly string[]) => void
  clearDamped: () => void
}

export const useCircuitStore = create<CircuitState>()((set, get) => ({
  circuitMode: false,
  toggleCircuitMode: () => {
    const next = !get().circuitMode
    document.body.toggleAttribute('data-circuit-mode', next)
    set({ circuitMode: next })
  },

  wireDrag: null,
  startWireDrag: (drag) => set({ wireDrag: { ...drag, hover: null }, pendingDrop: null }),
  updateWireDrag: (cursorWorld, hover) => {
    const drag = get().wireDrag
    if (!drag) return
    set({ wireDrag: { ...drag, cursorWorld, hover } })
  },
  endWireDrag: () => set({ wireDrag: null }),

  pendingDrop: null,
  setPendingDrop: (drop) => set({ pendingDrop: drop }),

  inspector: null,
  openInspector: (connectionId, x, y) => set({ inspector: { connectionId, x, y } }),
  closeInspector: () => set({ inspector: null }),

  firePulses: {},
  recordFires: (connectionIds) => {
    if (connectionIds.length === 0) return
    const now = Date.now()
    const firePulses = { ...get().firePulses }
    for (const id of connectionIds) firePulses[id] = now
    set({ firePulses })
  },

  dampedIds: new Set<string>(),
  dampConnections: (connectionIds) => {
    if (connectionIds.length === 0) return
    const dampedIds = new Set(get().dampedIds)
    for (const id of connectionIds) dampedIds.add(id)
    set({ dampedIds })
  },
  clearDamped: () => {
    if (get().dampedIds.size === 0) return
    set({ dampedIds: new Set<string>() })
  },
}))
