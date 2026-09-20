import Foundation

// ---------------------------------------------------------------------------
// Circuit UI state (`store/useCircuitStore.ts`) — everything ephemeral about
// wiring: the interaction session (port drags, the inspector, circuit mode)
// and the engine's visual telemetry (fire pulses, damped loops). Pure data;
// the owning store applies these mutations and publishes the result.
// ---------------------------------------------------------------------------

public struct PortHover: Equatable, Hashable, Sendable {
    public var widgetId: String
    public var portKey: String
    public var portKind: PortKind

    public init(widgetId: String, portKey: String, portKind: PortKind) {
        self.widgetId = widgetId
        self.portKey = portKey
        self.portKind = portKind
    }
}

/// A wire being dragged out of an output port.
public struct WireDrag: Equatable, Hashable, Sendable {
    public var fromId: String
    public var fromField: String
    public var valueType: FieldValueType
    /// Cursor in world coordinates — the ghost wire's live endpoint.
    public var cursorWorld: Vector2D
    /// Input-port candidate currently under the cursor, if any.
    public var hover: PortHover?

    public init(fromId: String, fromField: String, valueType: FieldValueType, cursorWorld: Vector2D, hover: PortHover? = nil) {
        self.fromId = fromId
        self.fromField = fromField
        self.valueType = valueType
        self.cursorWorld = cursorWorld
        self.hover = hover
    }
}

/// A wire dropped on a card body — the field picker resolves the target.
public struct PendingWireDrop: Equatable, Hashable, Sendable {
    public var fromId: String
    public var fromField: String
    public var valueType: FieldValueType
    public var toId: String
    public var screen: Vector2D

    public init(fromId: String, fromField: String, valueType: FieldValueType, toId: String, screen: Vector2D) {
        self.fromId = fromId
        self.fromField = fromField
        self.valueType = valueType
        self.toId = toId
        self.screen = screen
    }
}

/// Wire inspector popover target.
public struct WireInspectorTarget: Equatable, Hashable, Sendable {
    public var connectionId: String
    public var x: Double
    public var y: Double

    public init(connectionId: String, x: Double, y: Double) {
        self.connectionId = connectionId
        self.x = x
        self.y = y
    }
}

public struct CircuitUIState: Equatable {
    /// Circuit Mode — the whole live graph is illuminated.
    public var circuitMode = false
    public var wireDrag: WireDrag?
    public var pendingDrop: PendingWireDrop?
    public var inspector: WireInspectorTarget?
    /// connectionId → last fire timestamp (ms); drives the delivery pulse.
    public var firePulses: [String: Double] = [:]
    /// Connections silenced by the loop breaker until the circuit is edited.
    public var dampedIds: Set<String> = []

    public init() {}

    public mutating func setCircuitMode(_ active: Bool) { circuitMode = active }
    public mutating func toggleCircuitMode() { circuitMode.toggle() }

    public mutating func startWireDrag(fromId: String, fromField: String, valueType: FieldValueType, cursorWorld: Vector2D) {
        wireDrag = WireDrag(fromId: fromId, fromField: fromField, valueType: valueType, cursorWorld: cursorWorld, hover: nil)
        pendingDrop = nil
    }

    public mutating func updateWireDrag(cursorWorld: Vector2D, hover: PortHover?) {
        guard wireDrag != nil else { return }
        wireDrag?.cursorWorld = cursorWorld
        wireDrag?.hover = hover
    }

    public mutating func endWireDrag() { wireDrag = nil }

    public mutating func setPendingDrop(_ drop: PendingWireDrop?) { pendingDrop = drop }

    public mutating func openInspector(connectionId: String, x: Double, y: Double) {
        inspector = WireInspectorTarget(connectionId: connectionId, x: x, y: y)
    }

    public mutating func closeInspector() { inspector = nil }

    public mutating func recordFires(_ connectionIds: [String], at ms: Double) {
        if connectionIds.isEmpty { return }
        for id in connectionIds { firePulses[id] = ms }
    }

    public mutating func dampConnections(_ connectionIds: [String]) {
        if connectionIds.isEmpty { return }
        dampedIds.formUnion(connectionIds)
    }

    public mutating func clearDamped() {
        if dampedIds.isEmpty { return }
        dampedIds = []
    }
}
