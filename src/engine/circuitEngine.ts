import type { Connection } from '../types/circuit'
import type { ModuleData, Widget } from '../types/spatial'
import { commandsFor, fieldDescriptor, fieldsFor } from '../widgets/fields'
import { AUTOMATION_CORE_SET } from '../widgets/automationCoreCatalog'
import { applyTransform, fieldValueAsBool, serializeFieldValue } from './transforms'

// ---------------------------------------------------------------------------
// The circuit engine — deterministic propagation over the wire graph.
//
// Semantics (the four laws):
//
// 1. SINGLE FIRE — within one wave, each connection delivers at most once.
//    A wave therefore always terminates in ≤ |connections| firings, cycles
//    included, with no special-case graph analysis.
// 2. CHANGE ONLY — a connection fires only when its (transformed) source
//    value differs from the last value it delivered. Stable circuits reach a
//    fixpoint and go completely silent; re-running a wave over unchanged
//    state is a no-op by construction.
// 3. BATCHED COMMIT — all writes of a wave land in one store update with no
//    undo entry: deliveries are consequences of the edit that seeded the
//    wave, so a single Cmd+Z rewinds cause and effects together.
// 4. LOOP DAMPING — genuinely oscillating circuits (A bumps B, B bumps A)
//    are allowed to ring for a bounded burst, then the offending wires are
//    damped (silenced + flagged in the UI) until the circuit is edited.
//    A wiring mistake may never freeze the canvas.
// ---------------------------------------------------------------------------

/** Consecutive engine-fed waves allowed before the loop breaker trips. */
const BURST_LIMIT = 24

export interface DeliveryState {
  serialized: string
  bool: boolean
}

export type ConnectionIndex = ReadonlyMap<string, Connection[]>

/** Outgoing connections indexed by source widget. */
export function buildConnectionIndex(
  connections: Record<string, Connection>,
): ConnectionIndex {
  const index = new Map<string, Connection[]>()
  for (const connection of Object.values(connections)) {
    const list = index.get(connection.fromId)
    if (list) list.push(connection)
    else index.set(connection.fromId, [connection])
  }
  return index
}

export interface WaveInput {
  widgets: Record<string, Widget>
  index: ConnectionIndex
  /** Widgets whose data changed — the wave starts from their outgoing wires. */
  seeds: Iterable<string>
  /** Per-connection delivery memory. MUTATED by the wave. */
  lastDelivered: Map<string, DeliveryState>
  /** Wires silenced by the loop breaker. */
  dampedIds: ReadonlySet<string>
  /**
   * Baseline mode: refresh delivery memory to current values WITHOUT firing
   * anything. Used at startup and board load so a reload never replays
   * triggers or overwrites data the user changed elsewhere.
   */
  baselineOnly?: boolean
}

export interface WaveResult {
  /** widgetId → new module data, ready for one batched store commit. */
  writes: Map<string, ModuleData>
  /** Connections that actually delivered — drives the UI pulse. */
  firedIds: string[]
  /** Automation widgets whose async executor a trigger requested. */
  executeRequests: string[]
}

/**
 * Run one propagation wave. Pure with respect to the widget store: reads
 * `widgets`, returns `writes`; the only mutation is the wave's own delivery
 * memory. Deterministic given its inputs.
 */
export function runWave(input: WaveInput): WaveResult {
  const { widgets, index, lastDelivered, dampedIds } = input
  const writes = new Map<string, ModuleData>()
  const firedIds: string[] = []
  const executeRequests: string[] = []
  const fired = new Set<string>()
  const queue: string[] = [...new Set(input.seeds)]

  const dataOf = (widgetId: string): ModuleData | undefined =>
    writes.get(widgetId) ?? widgets[widgetId]?.data

  while (queue.length > 0) {
    const sourceId = queue.shift()!
    const outgoing = index.get(sourceId)
    if (!outgoing) continue
    for (const connection of outgoing) {
      if (fired.has(connection.id)) continue
      if (!connection.enabled || dampedIds.has(connection.id)) continue
      const source = widgets[connection.fromId]
      const target = widgets[connection.toId]
      if (!source || !target) continue
      const descriptor = fieldDescriptor(source.type, connection.fromField)
      if (!descriptor) continue
      const sourceData = dataOf(connection.fromId)
      if (!sourceData) continue

      if (connection.kind === 'value') {
        const value = applyTransform(descriptor.get(sourceData), connection.transform)
        const serialized = serializeFieldValue(value)
        const previous = lastDelivered.get(connection.id)
        if (previous?.serialized === serialized) continue
        lastDelivered.set(connection.id, { serialized, bool: fieldValueAsBool(value) })
        if (input.baselineOnly) continue
        fired.add(connection.id)
        const targetDescriptor = connection.toField
          ? fieldDescriptor(target.type, connection.toField)
          : undefined
        if (!targetDescriptor?.set) continue
        const targetData = dataOf(connection.toId)
        if (!targetData) continue
        // The target already reads as this value → delivery is a no-op.
        if (serializeFieldValue(targetDescriptor.get(targetData)) === serialized) continue
        writes.set(connection.toId, targetDescriptor.set(targetData, value))
        firedIds.push(connection.id)
        queue.push(connection.toId)
        continue
      }

      // Trigger wire — edge detection on the source value's movement.
      const raw = descriptor.get(sourceData)
      const serialized = serializeFieldValue(raw)
      const bool = fieldValueAsBool(raw)
      const previous = lastDelivered.get(connection.id)
      if (previous?.serialized === serialized) continue
      lastDelivered.set(connection.id, { serialized, bool })
      // First observation is a baseline, never a fire.
      if (previous === undefined || input.baselineOnly) continue
      const edgeFires =
        connection.edge === 'change'
          ? true
          : connection.edge === 'falling'
            ? previous.bool && !bool
            : !previous.bool && bool
      if (!edgeFires) continue
      fired.add(connection.id)

      // Automation-core 'execute' runs the real async executor (scripts,
      // HTTP, canvas operations) instead of the pure passthrough command.
      if (connection.command === 'execute' && AUTOMATION_CORE_SET.has(target.type)) {
        executeRequests.push(connection.toId)
        firedIds.push(connection.id)
        continue
      }
      const command = commandsFor(target.type).find((entry) => entry.key === connection.command)
      if (!command) continue
      const targetData = dataOf(connection.toId)
      if (!targetData) continue
      // The source's current (transformed) value rides along as the
      // command's payload — commands that don't read it are unaffected.
      const payload = applyTransform(raw, connection.transform)
      writes.set(connection.toId, command.run(targetData, payload))
      firedIds.push(connection.id)
      queue.push(connection.toId)
    }
  }

  return { writes, firedIds, executeRequests }
}

// ---------------------------------------------------------------------------
// Engine driver — subscribes to the widget store and turns state changes
// into waves. All cascading happens inside one flattened loop: the engine's
// own batched commit re-notifies the subscription, the re-entry guard bounces
// it, and the loop picks the new state up on its next pass. No recursion,
// no timers, no missed changes.
// ---------------------------------------------------------------------------

let activeCircuitDispose: (() => void) | null = null

export function initCircuitEngine(): () => void {
  if (activeCircuitDispose) return activeCircuitDispose
  let disposed = false
  let cleanup: (() => void) | null = null

  const dispose = () => {
    if (disposed) return
    disposed = true
    cleanup?.()
    cleanup = null
    if (activeCircuitDispose === dispose) activeCircuitDispose = null
  }
  activeCircuitDispose = dispose

  // Deferred imports keep the pure wave core dependency-free for tests.
  void Promise.all([
    import('../store/useWidgetStore'),
    import('../store/useCircuitStore'),
    import('./automationExecutor'),
    import('../store/useToastStore'),
  ]).then(([{ useWidgetStore }, { useCircuitStore }, { executeAutomationWidget }, { useToastStore }]) => {
    if (disposed) return
    let prevWidgets = useWidgetStore.getState().widgets
    let prevConnections = useWidgetStore.getState().connections
    let index = buildConnectionIndex(prevConnections)
    const lastDelivered = new Map<string, DeliveryState>()
    const forcedSeeds = new Set<string>()
    let lastFiredIds: string[] = []
    let processing = false
    let dampToastAt = 0

    // Startup: baseline delivery memory to the loaded board without firing —
    // a reload must never replay triggers or clobber current values.
    runWave({
      widgets: prevWidgets,
      index,
      seeds: [...index.keys()],
      lastDelivered,
      dampedIds: new Set(),
      baselineOnly: true,
    })

    const process = () => {
      if (processing) return
      processing = true
      try {
        for (let iteration = 0; ; iteration++) {
          const state = useWidgetStore.getState()
          const connectionsChanged = state.connections !== prevConnections
          const widgetsChanged = state.widgets !== prevWidgets
          if (!connectionsChanged && !widgetsChanged && forcedSeeds.size === 0) return

          const seeds = new Set<string>(forcedSeeds)
          forcedSeeds.clear()

          if (connectionsChanged) {
            // Editing the circuit lifts any damping — the user is fixing it.
            useCircuitStore.getState().clearDamped()
            for (const id of [...lastDelivered.keys()]) {
              if (!state.connections[id]) lastDelivered.delete(id)
            }
            // Widgets AND connections replaced together = board load / undo:
            // baseline silently. Connections alone = the user drew or edited
            // a wire: reset its memory so it delivers its current value now.
            const baselineSeeds: string[] = []
            for (const [id, connection] of Object.entries(state.connections)) {
              if (connection === prevConnections[id]) continue
              lastDelivered.delete(id)
              if (widgetsChanged) baselineSeeds.push(connection.fromId)
              else seeds.add(connection.fromId)
            }
            index = buildConnectionIndex(state.connections)
            prevConnections = state.connections
            if (baselineSeeds.length > 0) {
              runWave({
                widgets: state.widgets,
                index,
                seeds: baselineSeeds,
                lastDelivered,
                dampedIds: useCircuitStore.getState().dampedIds,
                baselineOnly: true,
              })
            }
          }

          if (widgetsChanged) {
            for (const sourceId of index.keys()) {
              if (state.widgets[sourceId]?.data !== prevWidgets[sourceId]?.data) {
                seeds.add(sourceId)
              }
            }
            prevWidgets = state.widgets
          }

          if (seeds.size === 0) return

          // Loop breaker: a cascade that is still writing after BURST_LIMIT
          // waves is oscillating — silence the wires that fired last.
          if (iteration >= BURST_LIMIT) {
            useCircuitStore.getState().dampConnections(lastFiredIds)
            if (Date.now() - dampToastAt > 4000) {
              dampToastAt = Date.now()
              useToastStore
                .getState()
                .addToast('Circuit loop damped — a wire cycle was oscillating. Edit any wire to resume.')
            }
            return
          }

          const wave = runWave({
            widgets: state.widgets,
            index,
            seeds,
            lastDelivered,
            dampedIds: useCircuitStore.getState().dampedIds,
          })
          if (wave.firedIds.length > 0) {
            lastFiredIds = wave.firedIds
            useCircuitStore.getState().recordFires(wave.firedIds)
          }
          for (const widgetId of wave.executeRequests) void executeAutomationWidget(widgetId)
          if (wave.writes.size === 0) {
            // Nothing written — loop only continues if something else changed.
            continue
          }
          // Commit re-notifies the subscription; the guard bounces it and the
          // next loop pass sees the fresh state.
          useWidgetStore.getState().applyWireWrites(wave.writes)
        }
      } finally {
        processing = false
      }
    }

    const unsubscribe = useWidgetStore.subscribe(process)
    process()

    // Minute-class heartbeat for time-sensitive source fields (countdowns,
    // due dates). Zero wires with such sources → the tick exits immediately.
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const state = useWidgetStore.getState()
      const sources = timeSensitiveSourceIds(state.connections, state.widgets)
      if (sources.length === 0) return
      for (const id of sources) forcedSeeds.add(id)
      process()
    }, 30_000)
    const refreshVisibleSources = () => {
      if (document.visibilityState !== 'visible') return
      const state = useWidgetStore.getState()
      for (const id of timeSensitiveSourceIds(state.connections, state.widgets)) forcedSeeds.add(id)
      process()
    }
    document.addEventListener('visibilitychange', refreshVisibleSources)
    cleanup = () => {
      unsubscribe()
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', refreshVisibleSources)
    }
    if (disposed) {
      cleanup()
      cleanup = null
    }
  }).catch((error: unknown) => {
    if (!disposed) console.error('Circuit engine failed to start:', error)
  })

  return dispose
}

/** Source widget-ids of wires whose source field re-reads on the clock. */
export function timeSensitiveSourceIds(
  connections: Record<string, Connection>,
  widgets: Record<string, Widget>,
): string[] {
  const ids = new Set<string>()
  for (const connection of Object.values(connections)) {
    const source = widgets[connection.fromId]
    if (!source) continue
    const descriptor = fieldsFor(source.type).find((field) => field.key === connection.fromField)
    if (descriptor?.timeSensitive) ids.add(connection.fromId)
  }
  return [...ids]
}
