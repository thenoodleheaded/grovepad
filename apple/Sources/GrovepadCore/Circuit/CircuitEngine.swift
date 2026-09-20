import Foundation

// ---------------------------------------------------------------------------
// The circuit engine — deterministic propagation over the wire graph
// (`engine/circuitEngine.ts`). The four laws:
//
// 1. SINGLE FIRE — within one wave, each connection delivers at most once,
//    so a wave terminates in ≤ |connections| firings, cycles included.
// 2. CHANGE ONLY — a connection fires only when its transformed source value
//    differs from the last value it delivered (per-connection memory).
// 3. BATCHED COMMIT — all writes of a wave land in one host commit with no
//    undo entry (the driver's job; the wave only returns them).
// 4. LOOP DAMPING — oscillating circuits ring for a bounded burst, then the
//    wires that fired last are damped until the circuit is edited (driver).
// ---------------------------------------------------------------------------

/// What a connection last delivered: the serialized value and its boolean reading.
public struct DeliveryState: Equatable, Hashable, Sendable {
    public var serialized: String
    public var bool: Bool

    public init(serialized: String, bool: Bool) {
        self.serialized = serialized
        self.bool = bool
    }
}

/// Outgoing connections indexed by source widget, connection order preserved
/// within a source and source order preserved across the index (a JavaScript
/// `Map` keyed in first-seen order).
public struct ConnectionIndex {
    public private(set) var bySource: [String: [Connection]] = [:]
    /// Source widget ids in first-seen order (`index.keys()`).
    public private(set) var sourceIds: [String] = []

    public init() {}

    public init(_ connections: [Connection]) {
        for connection in connections {
            if bySource[connection.fromId] == nil { sourceIds.append(connection.fromId) }
            bySource[connection.fromId, default: []].append(connection)
        }
    }

    public subscript(sourceId: String) -> [Connection]? { bySource[sourceId] }
}

public func buildConnectionIndex(_ connections: OrderedMap<Connection>) -> ConnectionIndex {
    ConnectionIndex(connections.values)
}

public func buildConnectionIndex(_ connections: [Connection]) -> ConnectionIndex {
    ConnectionIndex(connections)
}

public struct WaveInput {
    public var widgets: OrderedMap<Widget>
    public var index: ConnectionIndex
    /// Widgets whose data changed — the wave starts from their outgoing wires.
    public var seeds: [String]
    /// Wires silenced by the loop breaker.
    public var dampedIds: Set<String>
    /// Baseline mode: refresh delivery memory to current values WITHOUT
    /// firing anything (startup and board load).
    public var baselineOnly: Bool
    /// Mints ids for commands and setters that create items.
    public var minter: IdMinter

    public init(widgets: OrderedMap<Widget>, index: ConnectionIndex, seeds: [String], dampedIds: Set<String> = [], baselineOnly: Bool = false, minter: IdMinter = .system) {
        self.widgets = widgets
        self.index = index
        self.seeds = seeds
        self.dampedIds = dampedIds
        self.baselineOnly = baselineOnly
        self.minter = minter
    }
}

public struct WaveResult {
    /// widgetId → new module data, in write order, for one batched commit.
    public var writes: OrderedMap<JSONObject>
    /// Connections that actually delivered — drives the UI pulse.
    public var firedIds: [String]
    /// Automation widgets whose async executor a trigger requested.
    public var executeRequests: [String]

    public init(writes: OrderedMap<JSONObject> = [:], firedIds: [String] = [], executeRequests: [String] = []) {
        self.writes = writes
        self.firedIds = firedIds
        self.executeRequests = executeRequests
    }
}

/// Per-connection delivery memory (`Map<string, DeliveryState>`), owned by
/// the caller and mutated by every wave.
public typealias DeliveryMemory = OrderedMap<DeliveryState>

/// Run one propagation wave. Pure with respect to the board: reads widgets,
/// returns writes; the only mutation is the delivery memory. Deterministic.
public func runWave(_ input: WaveInput, memory lastDelivered: inout DeliveryMemory) -> WaveResult {
    let widgets = input.widgets
    let index = input.index
    var writes = OrderedMap<JSONObject>()
    var firedIds: [String] = []
    var executeRequests: [String] = []
    var fired: Set<String> = []
    var queue: [String] = []
    var seen: Set<String> = []
    for seed in input.seeds where seen.insert(seed).inserted { queue.append(seed) }
    var head = 0

    func dataOf(_ widgetId: String) -> JSONObject? {
        writes[widgetId] ?? widgets[widgetId]?.record.object("data")
    }

    while head < queue.count {
        let sourceId = queue[head]
        head += 1
        guard let outgoing = index[sourceId] else { continue }
        for connection in outgoing {
            if fired.contains(connection.id) { continue }
            if !connection.enabled || input.dampedIds.contains(connection.id) { continue }
            guard let source = widgets[connection.fromId], let target = widgets[connection.toId] else { continue }
            guard let descriptor = fieldDescriptor(source.type, connection.fromField) else { continue }
            guard let sourceData = dataOf(connection.fromId) else { continue }

            if connection.kind == .value {
                let value = applyTransform(descriptor.get(sourceData), connection.transform)
                let serialized = serializeFieldValue(value)
                if lastDelivered[connection.id]?.serialized == serialized { continue }
                lastDelivered[connection.id] = DeliveryState(serialized: serialized, bool: fieldValueAsBool(value))
                if input.baselineOnly { continue }
                fired.insert(connection.id)
                guard let toField = connection.toField, let targetDescriptor = fieldDescriptor(target.type, toField),
                      let setter = targetDescriptor.set else { continue }
                guard let targetData = dataOf(connection.toId) else { continue }
                // The target already reads as this value → delivery is a no-op.
                if serializeFieldValue(targetDescriptor.get(targetData)) == serialized { continue }
                writes[connection.toId] = setter(targetData, value, input.minter)
                firedIds.append(connection.id)
                queue.append(connection.toId)
                continue
            }

            // Trigger wire — edge detection on the source value's movement.
            let raw = descriptor.get(sourceData)
            let serialized = serializeFieldValue(raw)
            let bool = fieldValueAsBool(raw)
            let previous = lastDelivered[connection.id]
            if previous?.serialized == serialized { continue }
            lastDelivered[connection.id] = DeliveryState(serialized: serialized, bool: bool)
            // First observation is a baseline, never a fire.
            guard let previous, !input.baselineOnly else { continue }
            let edgeFires: Bool
            switch connection.edge {
            case .change: edgeFires = true
            case .falling: edgeFires = previous.bool && !bool
            default: edgeFires = !previous.bool && bool
            }
            if !edgeFires { continue }
            fired.insert(connection.id)

            // Automation-core 'execute' runs the real async executor instead of
            // the pure passthrough command.
            if connection.command == "execute", WidgetTypeCatalog.automationCoreTypes.contains(target.type) {
                executeRequests.append(connection.toId)
                firedIds.append(connection.id)
                continue
            }
            guard let command = commandsFor(target.type).first(where: { $0.key == connection.command }) else { continue }
            guard let targetData = dataOf(connection.toId) else { continue }
            // The source's current (transformed) value rides along as the payload.
            let payload = applyTransform(raw, connection.transform)
            writes[connection.toId] = command.run(targetData, payload, input.minter)
            firedIds.append(connection.id)
            queue.append(connection.toId)
        }
    }

    return WaveResult(writes: writes, firedIds: firedIds, executeRequests: executeRequests)
}

/// Source widget ids of wires whose source field re-reads on the clock, in
/// first-seen connection order.
public func timeSensitiveSourceIds(connections: OrderedMap<Connection>, widgets: OrderedMap<Widget>) -> [String] {
    var ids: [String] = []
    var seen: Set<String> = []
    for connection in connections.values {
        guard let source = widgets[connection.fromId] else { continue }
        guard let descriptor = fieldsFor(source.type).first(where: { $0.key == connection.fromField }), descriptor.timeSensitive else { continue }
        if seen.insert(connection.fromId).inserted { ids.append(connection.fromId) }
    }
    return ids
}
