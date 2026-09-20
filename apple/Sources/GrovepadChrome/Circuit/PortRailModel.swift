import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// Port rails (`components/widgets/PortRail.tsx`, the model half): the quiet
// circuit affordance on every card. Output ports (every readable field) on
// the right rail, input ports (settable fields first, then commands) on the
// left. Positions come from GrovepadCanvas `PortGeometry` over the card's
// on-screen footprint — the same math the wire layer and drop hit-testing
// use, so a wire always lands exactly on its dot. Pure: no SwiftUI.
//
// Visibility follows the circuit engine's UX law: at rest a card draws zero
// port pixels; a hovered card, a card during a wire drag, and every card in
// Circuit Mode wear their rails. (The web's PortRail.tsx currently mounts in
// Circuit Mode only — a mismatch with docs/circuit-engine.md that the port
// resolves in the constitution's favour, recorded in the phase-4 report.)
// ---------------------------------------------------------------------------

/// One drawn port: its spec, its side, and where it sits.
public struct PortHandle: Equatable, Sendable {
    public var key: String
    public var label: String
    public var kind: PortKind
    public var side: PortSide
    public var valueType: FieldValueType?
    public var unit: SemanticUnit?
    public var acceptsPayload: Bool
    /// Slot on its rail.
    public var index: Int
    /// World position of the dot's centre.
    public var world: Vector2D
    /// The same point relative to the card's footprint origin.
    public var local: Vector2D
    /// `--gp-port-color`: the field's value flavour, rose for a command.
    public var color: String

    public var spec: PortSpec {
        PortSpec(key: key, label: label, kind: kind, valueType: valueType, unit: unit, acceptsPayload: acceptsPayload, index: index)
    }

    /// `PortHover` for this handle on `widgetId`.
    public func hover(on widgetId: String) -> PortHover {
        PortHover(widgetId: widgetId, portKey: key, portKind: kind)
    }

    /// Whether a wire drag may land here. Fields stay promiscuous — any
    /// source value coerces through the target setter (widget constitution
    /// III.3) — and every source field has a boolean reading, so every drag
    /// can trigger a command. The only refusals are "no drag" and "my own
    /// card" (the web disables inputs while `!dragActive || isDragSource`).
    public func isCompatible(with drag: WireDrag?, on widgetId: String) -> Bool {
        guard let drag, drag.fromId != widgetId, side == .input else { return false }
        return true
    }

    /// `data-hot`: the drag's cursor is over this port.
    public func isHot(in drag: WireDrag?, on widgetId: String) -> Bool {
        guard let hover = drag?.hover else { return false }
        return hover.widgetId == widgetId && hover.portKey == key && hover.portKind == kind
    }
}

/// Both rails of one card over one footprint.
public struct PortRail: Equatable, Sendable {
    public var widgetId: String
    public var frame: WorldRect
    public var outputs: [PortHandle]
    public var inputs: [PortHandle]

    public var isEmpty: Bool { outputs.isEmpty && inputs.isEmpty }
}

public enum PortRailModel {
    /// The drawn dot (`.gp-port` 10 px).
    public static let dotDiameter = 10.0
    /// The finger floor (touch adaptation, question 2), in screen points.
    public static let touchTarget = Double(GlassTokens.touchTarget)

    static func handles(_ specs: [PortSpec], side: PortSide, frame: WorldRect) -> [PortHandle] {
        specs.map { spec in
            let world = PortGeometry.portWorldPosition(frame: frame, side: side, index: spec.index, count: specs.count)
            return PortHandle(
                key: spec.key, label: spec.label, kind: spec.kind, side: side,
                valueType: spec.valueType, unit: spec.unit, acceptsPayload: spec.acceptsPayload, index: spec.index,
                world: world,
                local: Vector2D(x: world.x - frame.x, y: world.y - frame.y),
                color: spec.kind == .command ? WireColors.trigger : WireColors.hex(for: spec.valueType ?? .text)
            )
        }
    }

    /// The right rail: every readable field, in field order.
    public static func outputs(for widget: Widget, frame: WorldRect) -> [PortHandle] {
        handles(outputPortsFor(widget.type), side: .output, frame: frame)
    }

    /// The left rail: settable fields, then commands.
    public static func inputs(for widget: Widget, frame: WorldRect) -> [PortHandle] {
        handles(inputPortsFor(widget.type), side: .input, frame: frame)
    }

    /// Both rails over the box the card is drawn on right now.
    public static func rail(for widget: Widget, restContext: RestContext) -> PortRail {
        let frame = displayedWidgetRect(widget, restContext: restContext)
        return PortRail(widgetId: widget.id, frame: frame, outputs: outputs(for: widget, frame: frame), inputs: inputs(for: widget, frame: frame))
    }

    /// Rest state: zero pixels. Hovered, mid-drag, or Circuit Mode: the rail.
    public static func isVisible(widgetId: String, hoverWidgetId: String?, circuitUI: CircuitUIState) -> Bool {
        if circuitUI.circuitMode { return true }
        if circuitUI.wireDrag != nil { return true }
        return hoverWidgetId == widgetId
    }

    /// While a wire is in flight only its source keeps its output dots
    /// (`showOutputs = !dragActive || isDragSource`).
    public static func showsOutputs(widgetId: String, drag: WireDrag?) -> Bool {
        guard let drag else { return true }
        return drag.fromId == widgetId
    }

    /// Port labels extend from the dots in Circuit Mode only.
    public static func showsLabels(circuitUI: CircuitUIState) -> Bool {
        circuitUI.circuitMode
    }

    /// The invisible hit box around a dot: 44 screen points, converted to
    /// world units at `zoom`, centred on the dot so the drawn point never
    /// moves (widget constitution III.4). Never smaller than the dot.
    public static func hitRect(for handle: PortHandle, zoom: Double) -> WorldRect {
        let edge = max(dotDiameter, touchTarget / max(zoom, 0.0001))
        return WorldRect(x: handle.world.x - edge / 2, y: handle.world.y - edge / 2, width: edge, height: edge)
    }
}
