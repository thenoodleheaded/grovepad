import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The wire layer's model (`components/canvas/WireLayer.tsx`, the descriptor
// building): one `EdgeDescriptor` per connection whose two endpoints sit on
// the active canvas. Endpoints are the output rail slot on the source's
// on-screen footprint and the input rail slot on the target's — the same
// `displayedWidgetRect` the rail paints on, so a wire always lands on its dot.
// Every geometry number comes from GrovepadCanvas (`PortGeometry`,
// `flowCurve`); every colour from `WireColors`. Pure: no SwiftUI, no layers.
// ---------------------------------------------------------------------------

/// A chip pinned at a wire's midpoint: the live value in Circuit Mode, or
/// the red `!` of a damped wire.
public struct WireChip: Equatable, Sendable {
    public var connectionId: String
    public var position: Vector2D
    public var text: String
    public var color: String
    public var damped: Bool

    public init(connectionId: String, position: Vector2D, text: String, color: String, damped: Bool) {
        self.connectionId = connectionId
        self.position = position
        self.text = text
        self.color = color
        self.damped = damped
    }
}

/// The ghost wire's own paint (`GhostWire` in WireLayer.tsx): a soft halo, a
/// marching dash, and a dot under the cursor. It is not an `EdgePaintStack`
/// because the ghost is never a settled edge — it has no hit target, no
/// pulse and no inspector.
public struct GhostWirePaint: Equatable, Sendable {
    public var curve: CubicCurve
    public var cursor: Vector2D
    public var color: String
    public static let haloWidth = 6.0
    public static let haloOpacity = 0.25
    public static let strokeWidth = 2.0
    public static let dash: [Double] = [6, 5]
    public static let cursorRadius = 4.0
}

/// One frame of the wire layer: what the edge renderer mounts and what the
/// chip overlay draws on top.
public struct WireLayerFrame: Equatable, Sendable {
    public var descriptors: [EdgeDescriptor]
    public var chips: [WireChip]

    public init(descriptors: [EdgeDescriptor] = [], chips: [WireChip] = []) {
        self.descriptors = descriptors
        self.chips = chips
    }
}

public enum WireLayerModel {
    /// `PULSE_WINDOW_MS`: a delivery older than this no longer keys a pulse.
    public static let pulseWindowMs = 1400.0
    /// Value chips render only under this edge budget (`relevant.length <= 80`).
    public static let valueChipBudget = 80
    /// The ghost wire's descriptor id, when it is handed to a renderer.
    public static let ghostId = "gp-ghost-wire"

    /// The two rail points a connection runs between, or nil when either
    /// port is unknown to the field tables (`wireEndpoints`).
    public static func endpoints(connection: Connection, source: Widget, sourceFrame: WorldRect, target: Widget, targetFrame: WorldRect) -> (start: Vector2D, end: Vector2D)? {
        guard let fromPort = findOutputPort(source.type, connection.fromField) else { return nil }
        let toPort: PortSpec?
        switch connection.kind {
        case .value:
            toPort = connection.toField.flatMap { findInputPort(target.type, $0, .field) }
        case .trigger:
            toPort = connection.command.flatMap { findInputPort(target.type, $0, .command) }
        }
        guard let toPort else { return nil }
        return (
            PortGeometry.portWorldPosition(frame: sourceFrame, side: .output, index: fromPort.index, count: outputPortsFor(source.type).count),
            PortGeometry.portWorldPosition(frame: targetFrame, side: .input, index: toPort.index, count: inputPortsFor(target.type).count)
        )
    }

    /// The colour a wire, its ports and its chip share: the SOURCE field's
    /// value flavour, or rose for a trigger.
    public static func color(for connection: Connection, source: Widget) -> String {
        if connection.kind == .trigger { return WireColors.trigger }
        return WireColors.hex(for: fieldDescriptor(source.type, connection.fromField)?.valueType ?? .text)
    }

    /// `shortValue`: the midpoint chip's text for a field value.
    public static func shortValue(_ value: FieldValue) -> String {
        switch value {
        case .series(let points):
            return "\(points.count) pts"
        case .number(let number):
            if abs(number) >= 1000 { return JavaScript.numberString(number.rounded()) }
            return JavaScript.numberString(jsRound(number * 100) / 100)
        case .bool(let flag):
            return flag ? "on" : "off"
        case .text(let string):
            let text = JavaScript.trim(string)
            let units = Array(text.utf16)
            if units.count > 14 { return String(decoding: units.prefix(13), as: UTF16.self) + "…" }
            return text.isEmpty ? "\"\"" : text
        }
    }

    /// The transformed source value a value wire currently carries, formatted
    /// for its chip; nil for trigger wires and unknown fields.
    public static func valueChip(for connection: Connection, board: Board) -> String? {
        guard connection.kind == .value, let source = board.widgets[connection.fromId],
              let field = fieldDescriptor(source.type, connection.fromField) else { return nil }
        return shortValue(applyTransform(field.get(source.data), connection.transform))
    }

    /// Every wire on `canvasId` (the active canvas by default), as the web's
    /// `useMemo` builds them. `hoverWidgetId` marks the wires touching the
    /// hovered card as connected; `hoveredWireId` is the one under the pointer;
    /// `visibleRect` culls wires whose control bounds miss the window.
    public static func frame(
        board: Board,
        canvasId: String,
        restContext: RestContext,
        circuitUI: CircuitUIState,
        now: Double,
        hoverWidgetId: String? = nil,
        hoveredWireId: String? = nil,
        visibleRect: WorldRect? = nil
    ) -> WireLayerFrame {
        var relevant: [Connection] = []
        for connection in board.connections.values {
            guard let source = board.widgets[connection.fromId], let target = board.widgets[connection.toId] else { continue }
            if source.canvasId == canvasId, target.canvasId == canvasId { relevant.append(connection) }
        }
        let showValues = circuitUI.circuitMode && relevant.count <= valueChipBudget
        var descriptors: [EdgeDescriptor] = []
        var chips: [WireChip] = []
        for connection in relevant {
            let source = board.widgets[connection.fromId]!
            let target = board.widgets[connection.toId]!
            // Wires land on the on-screen footprint — a resting tile's edge, not
            // the dormant full-card bounds.
            guard let ends = endpoints(
                connection: connection,
                source: source, sourceFrame: displayedWidgetRect(source, restContext: restContext),
                target: target, targetFrame: displayedWidgetRect(target, restContext: restContext)
            ) else { continue }
            let curve = flowCurve(start: ends.start, end: ends.end)
            if let visibleRect, !curve.curve.controlBounds.intersects(visibleRect) { continue }
            let sourceField = fieldDescriptor(source.type, connection.fromField)
            let isTrigger = connection.kind == .trigger
            let damped = circuitUI.dampedIds.contains(connection.id)
            let stroke = color(for: connection, source: source)
            var pulseKey: Double?
            if let at = circuitUI.firePulses[connection.id], now - at < pulseWindowMs { pulseKey = at }
            descriptors.append(EdgeDescriptor(
                id: connection.id,
                route: curve.curve,
                mid: curve.mid,
                semantics: .wire(valueType: isTrigger ? nil : (sourceField?.valueType ?? .text), isTrigger: isTrigger, enabled: connection.enabled, damped: damped),
                connected: hoverWidgetId != nil && (hoverWidgetId == connection.fromId || hoverWidgetId == connection.toId),
                hovered: hoveredWireId == connection.id,
                pulseKey: pulseKey
            ))
            if damped {
                chips.append(WireChip(connectionId: connection.id, position: curve.mid, text: "!", color: EdgeColors.wireDamped, damped: true))
            } else if showValues, !isTrigger, let sourceField {
                let text = shortValue(applyTransform(sourceField.get(source.data), connection.transform))
                let chipColor = connection.enabled ? stroke : EdgeColors.wireDisabled
                chips.append(WireChip(connectionId: connection.id, position: curve.mid, text: text, color: chipColor, damped: false))
            }
        }
        return WireLayerFrame(descriptors: descriptors, chips: chips)
    }

    /// The descriptors alone, over a document's live state.
    public static func wireDescriptors(document: BoardDocument, canvasId: String? = nil, restContext: RestContext, circuitUI: CircuitUIState? = nil, now: Double, hoveredWireId: String? = nil, visibleRect: WorldRect? = nil) -> [EdgeDescriptor] {
        frame(
            board: document.board,
            canvasId: canvasId ?? document.activeCanvasId,
            restContext: restContext,
            circuitUI: circuitUI ?? document.circuitUI,
            now: now,
            hoverWidgetId: document.hoverWidgetId,
            hoveredWireId: hoveredWireId,
            visibleRect: visibleRect
        ).descriptors
    }

    /// The in-flight wire from the drag's source port to the cursor. The
    /// ghost leaves the dot that was actually grabbed, so it starts on the
    /// on-screen footprint — the same substitution settled wires make.
    public static func ghostWire(drag: WireDrag, board: Board, restContext: RestContext) -> GhostWirePaint? {
        guard let source = board.widgets[drag.fromId], let port = findOutputPort(source.type, drag.fromField) else { return nil }
        let frame = displayedWidgetRect(source, restContext: restContext)
        let start = PortGeometry.portWorldPosition(frame: frame, side: .output, index: port.index, count: outputPortsFor(source.type).count)
        let curve = flowCurve(start: start, end: drag.cursorWorld)
        return GhostWirePaint(curve: curve.curve, cursor: drag.cursorWorld, color: WireColors.hex(for: drag.valueType))
    }

    /// The ghost as an edge descriptor, for a renderer that only takes edges.
    /// It reads as a hovered, enabled value wire in the drag's colour.
    public static func ghostWireDescriptor(drag: WireDrag, board: Board, restContext: RestContext) -> EdgeDescriptor? {
        guard let paint = ghostWire(drag: drag, board: board, restContext: restContext) else { return nil }
        return EdgeDescriptor(
            id: ghostId,
            route: paint.curve,
            mid: paint.curve.point(at: 0.5),
            semantics: .wire(valueType: drag.valueType, isTrigger: false, enabled: true, damped: false),
            hovered: true
        )
    }
}
